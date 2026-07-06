import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  SalesRepo,
  PurchaseRepo,
  ExpenseRepo,
  PaymentRepo,
  SaleReturnRepo,
  PurchaseReturnRepo,
  CashAdjustmentRepo,
  BankRepo,
  BankTxnRepo,
  CompanyRepo,
} from "@/repositories";
import { buildBankLedger, paidViaPayments } from "@/lib/ledger";
import { fmtMoney, fmtDate, today, ymd } from "@/lib/format";
import { printWithName } from "@/lib/print";
import { downloadCsv } from "@/lib/csv";
import { fmtMode } from "@/components/ModePills";
import {
  BookOpen,
  Printer,
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  ShoppingCart,
  Truck,
  Receipt,
  TrendingUp,
  TrendingDown,
  Wallet,
  Landmark,
  ArrowDownCircle,
  ArrowUpCircle,
} from "lucide-react";

export const Route = createFileRoute("/daybook")({ component: DaybookPage });

interface DayRow {
  created: string;
  type: string;
  ref: string;
  party: string;
  mode: string;
  bankId?: string;
  amount: number; // full invoice/txn value, signed — drives the Total column and Sales/Purchase totals
  cash: number; // actual money that changed hands on this date, signed — drives Money In/Out and cash reconciliation. A credit sale has amount > 0 but cash = 0.
  docId?: string;
  docKind?: "sale" | "purchase" | "sale-return" | "purchase-return";
}

function DaybookPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(today());
  const [q, setQ] = useState("");

  const rows = useMemo<DayRow[]>(() => {
    const list: DayRow[] = [];
    // invoice.paid already folds in amounts later applied via Payment
    // records (see ledger.ts) — if we used it as-is here, a payment
    // collected after billing would count twice: once inside the Sale row's
    // cash figure, and again as its own Payment In/Out row below.
    const applied = paidViaPayments(PaymentRepo.all());
    for (const s of SalesRepo.all().filter((x) => x.date === date))
      list.push({
        created: s.createdAt,
        type: "Sale",
        ref: s.number,
        party: s.partyName,
        mode: s.paymentMode,
        bankId: s.bankId,
        amount: s.total,
        cash: Math.max(0, (s.paid || 0) - (applied.get(s.id) ?? 0)),
        docId: s.id,
        docKind: "sale",
      });
    for (const p of PurchaseRepo.all().filter((x) => x.date === date))
      list.push({
        created: p.createdAt,
        type: "Purchase",
        ref: p.number,
        party: p.partyName,
        mode: p.paymentMode,
        bankId: p.bankId,
        amount: -p.total,
        cash: -Math.max(0, (p.paid || 0) - (applied.get(p.id) ?? 0)),
        docId: p.id,
        docKind: "purchase",
      });
    for (const r of SaleReturnRepo.all().filter((x) => x.date === date))
      list.push({
        created: r.createdAt,
        type: "Sale Return",
        ref: r.number,
        party: r.partyName,
        mode: "—",
        amount: -r.total,
        cash: -r.total,
        docId: r.id,
        docKind: "sale-return",
      });
    for (const r of PurchaseReturnRepo.all().filter((x) => x.date === date))
      list.push({
        created: r.createdAt,
        type: "Purchase Return",
        ref: r.number,
        party: r.partyName,
        mode: "—",
        amount: r.total,
        cash: r.total,
        docId: r.id,
        docKind: "purchase-return",
      });
    for (const p of PaymentRepo.all().filter((x) => x.date === date))
      list.push({
        created: p.createdAt,
        type: p.type === "in" ? "Payment In" : "Payment Out",
        ref: p.allocations?.map((a) => a.number).join(", ") || p.ref || "—",
        party: p.partyName,
        mode: p.mode,
        bankId: p.bankId,
        amount: p.type === "in" ? p.amount : -p.amount,
        cash: p.type === "in" ? p.amount : -p.amount,
      });
    for (const e of ExpenseRepo.all().filter((x) => x.date === date))
      list.push({
        created: e.createdAt,
        type: "Expense",
        ref: e.category,
        party: "—",
        mode: e.paymentMode,
        amount: -e.amount,
        cash: -e.amount,
      });
    for (const a of CashAdjustmentRepo.all().filter((x) => x.date === date))
      list.push({
        created: a.createdAt,
        type: a.type === "add" ? "Cash Added" : "Cash Reduced",
        ref: a.reason || "Adjustment",
        party: "—",
        mode: "cash",
        amount: a.type === "add" ? a.amount : -a.amount,
        cash: a.type === "add" ? a.amount : -a.amount,
      });
    for (const t of BankTxnRepo.all().filter((x) => x.date === date))
      list.push({
        created: t.createdAt,
        type: t.type === "deposit" ? "Bank Deposit" : "Bank Withdrawal",
        ref: t.notes || "Adjustment",
        party: "—",
        mode: "bank",
        bankId: t.bankId,
        amount: t.type === "deposit" ? t.amount : -t.amount,
        cash: t.type === "deposit" ? t.amount : -t.amount,
      });
    list.sort((a, b) => (a.created ?? "").localeCompare(b.created ?? ""));
    return list;
  }, [date]);

  const bankNameById = useMemo(() => new Map(BankRepo.all().map((b) => [b.id, b.name])), []);
  // "Bank (unspecified)" — not "Bank" — for older records saved before bank
  // selection existed, so it reads as "this one's missing data" rather than
  // looking like the bank name feature silently isn't working.
  const modeLabel = (r: DayRow) => {
    if (r.mode !== "bank") return fmtMode(r.mode);
    if (!r.bankId) return "Bank (unspecified)";
    return `Bank — ${bankNameById.get(r.bankId) ?? "unspecified"}`;
  };

  // Per-bank movement for the day, plus balance as of end of day — reuses
  // the same passbook engine as the Bank Accounts page so the two never
  // disagree on a bank's numbers.
  const bankSummaries = useMemo(() => {
    const banks = BankRepo.all();
    if (!banks.length) return [];
    const data = {
      sales: SalesRepo.all(),
      purchases: PurchaseRepo.all(),
      payments: PaymentRepo.all(),
      bankTxns: BankTxnRepo.all(),
    };
    return banks.map((b) => {
      const dayOnly = buildBankLedger(b, data, date, date);
      const upToDate = buildBankLedger(b, data, "", date);
      const closing = upToDate.rows.length
        ? upToDate.rows[upToDate.rows.length - 1].balance
        : b.openingBalance || 0;
      return { bank: b, in: dayOnly.totalCredit, out: dayOnly.totalDebit, closing };
    });
  }, [date]);

  const sum = (type: string) =>
    rows.filter((r) => r.type === type).reduce((s, r) => s + Math.abs(r.amount), 0);
  const totalSale = sum("Sale");
  const totalPurchase = sum("Purchase");
  const expense = sum("Expense");
  // Net/cash reconciliation is driven by `cash` (actual money moved), not
  // `amount` (invoice value) — a credit or partly-paid sale shouldn't count
  // as cash in just because it happened today.
  const net = rows.reduce((s, r) => s + r.cash, 0);
  const cashIn = rows
    .filter((r) => r.mode === "cash" && r.cash > 0)
    .reduce((s, r) => s + r.cash, 0);
  const cashOut = Math.abs(
    rows.filter((r) => r.mode === "cash" && r.cash < 0).reduce((s, r) => s + r.cash, 0),
  );
  // Bank-mode entries with no bankId (older records saved before bank
  // selection was required) and legacy upi/cheque modes aren't tied to any
  // real account — bucket them so the summary always reconciles with the
  // full day total instead of silently dropping that money from the view.
  const isUnassigned = (r: DayRow) =>
    (r.mode === "bank" && !r.bankId) || r.mode === "upi" || r.mode === "cheque";
  const unassignedIn = rows
    .filter((r) => isUnassigned(r) && r.cash > 0)
    .reduce((s, r) => s + r.cash, 0);
  const unassignedOut = Math.abs(
    rows.filter((r) => isUnassigned(r) && r.cash < 0).reduce((s, r) => s + r.cash, 0),
  );

  const filteredRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.type, r.ref, r.party, modeLabel(r)].some((v) => v.toLowerCase().includes(s)),
    );
  }, [rows, q]);

  const totalMoneyIn = rows.filter((r) => r.cash > 0).reduce((s, r) => s + r.cash, 0);
  const totalMoneyOut = Math.abs(
    rows.filter((r) => r.cash < 0).reduce((s, r) => s + r.cash, 0),
  );

  const shiftDay = (delta: number) => {
    const [y, m, dd] = date.split("-").map(Number);
    const d = new Date(y, m - 1, dd + delta);
    setDate(ymd(d));
  };

  const openRow = (r: DayRow) => {
    if (!r.docId || !r.docKind) return;
    if (r.docKind === "sale") navigate({ to: "/sales/$id", params: { id: r.docId } });
    else if (r.docKind === "purchase") navigate({ to: "/purchase/$id", params: { id: r.docId } });
    else if (r.docKind === "sale-return")
      navigate({ to: "/sale-return/$id", params: { id: r.docId } });
    else navigate({ to: "/purchase-return/$id", params: { id: r.docId } });
  };

  const downloadExcel = () => {
    const meta: string[][] = [
      ["Daybook"],
      [`Company: ${CompanyRepo.get().name}`],
      [`Date: ${fmtDate(date)}`],
      [`Generated: ${fmtDate(new Date().toISOString())}`],
      [],
      ["Cash & Bank Summary"],
      ["Account", "In", "Out", "Closing Balance"],
      ["Cash", fmtMoney(cashIn), fmtMoney(cashOut), ""],
      ...bankSummaries.map((b) => [
        b.bank.name,
        fmtMoney(b.in),
        fmtMoney(b.out),
        fmtMoney(b.closing),
      ]),
      ...(unassignedIn || unassignedOut
        ? [["Other / Unspecified Bank", fmtMoney(unassignedIn), fmtMoney(unassignedOut), ""]]
        : []),
      [],
    ];
    const header = ["#", "Name", "Ref No", "Type", "Payment Type", "Total", "Money In", "Money Out"];
    const body = rows.map((r, i) => [
      String(i + 1),
      r.party,
      r.ref,
      r.type,
      modeLabel(r),
      fmtMoney(Math.abs(r.amount)),
      r.cash > 0 ? fmtMoney(r.cash) : "",
      r.cash < 0 ? fmtMoney(Math.abs(r.cash)) : "",
    ]);
    const totalsRow = [
      "",
      "",
      "",
      "",
      "",
      "",
      `Total Money-In: ${fmtMoney(totalMoneyIn)}`,
      `Total Money-Out: ${fmtMoney(totalMoneyOut)}`,
    ];
    const netRow = [
      "",
      "",
      "",
      "",
      "",
      "",
      "Net for the day",
      `${net >= 0 ? "" : "-"}${fmtMoney(Math.abs(net))}`,
    ];
    const allRows = [...meta, header, ...body, [], totalsRow, netRow];
    downloadCsv(`Daybook-${date}`, allRows[0], allRows.slice(1));
  };

  return (
    <div className="flex flex-col h-full bg-[#f5f6fa]">
      <div className="no-print bg-white border-b px-5 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-primary-soft text-primary flex items-center justify-center">
            <BookOpen className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-[17px] font-bold text-gray-800">Daybook</h1>
            <p className="text-[12px] text-gray-400">
              {rows.length} transactions on {fmtDate(date)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => shiftDay(-1)}
            className="h-8 w-8 rounded-md border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-500"
            title="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-200 rounded-md text-sm px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            onClick={() => shiftDay(1)}
            className="h-8 w-8 rounded-md border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-500"
            title="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setDate(today())}
            className="h-8 px-3 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-600"
          >
            Today
          </button>
          <button
            onClick={downloadExcel}
            className="inline-flex items-center gap-1.5 h-8 px-3 bg-white border border-gray-200 rounded-md text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" /> Download Excel
          </button>
          <button
            onClick={() => printWithName(`Daybook-${date}`)}
            className="inline-flex items-center gap-1.5 h-8 px-3 bg-white border border-gray-200 rounded-md text-xs font-semibold text-gray-600 hover:bg-gray-50"
            title="Print, or choose 'Save as PDF' in the print dialog"
          >
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </button>
          <div className="relative w-44 lg:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, ref no, type…"
              className="w-full h-8 pl-8 pr-3 border border-gray-200 rounded-md text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>
      </div>

      {/* Summary — day totals and every cash/bank account as compact KPI
          cards in one row, so the table below gets the space instead of two
          stacked summary blocks. Payment In/Out were dropped — they just
          repeated numbers already visible per-account below. */}
      <div className="no-print bg-white border-b px-5 py-3 overflow-x-auto">
        <div className="flex items-stretch gap-3 min-w-max">
          <KpiCard icon={<ShoppingCart className="h-4 w-4" />} label="Sales" value={totalSale} tone="emerald" />
          <KpiCard icon={<Truck className="h-4 w-4" />} label="Purchase" value={totalPurchase} tone="rose" />
          <KpiCard icon={<Receipt className="h-4 w-4" />} label="Expenses" value={expense} tone="rose" />
          <KpiCard
            icon={net >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            label="Net"
            value={net}
            tone={net >= 0 ? "emerald" : "rose"}
            signed
          />
          <div className="w-px bg-gray-100 my-1.5" />
          <AccountCard icon={<Wallet className="h-4 w-4" />} label="Cash" in={cashIn} out={cashOut} />
          {bankSummaries.map(({ bank, in: bankIn, out: bankOut, closing }) => (
            <AccountCard
              key={bank.id}
              icon={<Landmark className="h-4 w-4" />}
              label={bank.name}
              in={bankIn}
              out={bankOut}
              balance={closing}
            />
          ))}
          {(unassignedIn > 0 || unassignedOut > 0) && (
            <AccountCard
              icon={<Landmark className="h-4 w-4" />}
              label="Other / Unspecified"
              in={unassignedIn}
              out={unassignedOut}
              warn
            />
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="print-visible bg-white print:p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse min-w-max">
              <thead>
                <tr className="bg-gray-50">
                  {["#", "Name", "Ref No", "Type", "Payment Type", "Total", "Money In", "Money Out"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200 whitespace-nowrap ${i >= 5 ? "text-right" : "text-left"}`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-14 text-gray-400">
                      {rows.length === 0 ? "No transactions on this day" : "No matches for your search"}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r, i) => (
                    <tr
                      key={i}
                      onClick={() => openRow(r)}
                      title={r.docId ? "Open this bill" : undefined}
                      className={`border-b border-gray-100 hover:bg-gray-50/60 ${r.docId ? "cursor-pointer" : ""}`}
                    >
                      <td className="px-4 py-2.5 text-gray-400 text-[11px] whitespace-nowrap">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">
                        {r.party}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600 whitespace-nowrap">
                        {r.ref}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-gray-700 whitespace-nowrap">
                        {r.type}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        {modeLabel(r)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                        {fmtMoney(Math.abs(r.amount))}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 tabular-nums whitespace-nowrap">
                        {r.cash > 0 ? fmtMoney(r.cash) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-rose-600 tabular-nums whitespace-nowrap">
                        {r.cash < 0 ? fmtMoney(Math.abs(r.cash)) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="no-print bg-gray-50 border-t px-5 py-3 flex items-center justify-end gap-3 flex-wrap">
          <TotalPill
            icon={<ArrowDownCircle className="h-4 w-4" />}
            label="Total Money-In"
            value={totalMoneyIn}
            tone="emerald"
          />
          <TotalPill
            icon={<ArrowUpCircle className="h-4 w-4" />}
            label="Total Money-Out"
            value={totalMoneyOut}
            tone="rose"
          />
          <TotalPill
            icon={net >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            label="Net for the Day"
            value={net}
            tone={net >= 0 ? "emerald" : "rose"}
            signed
            emphasized
          />
        </div>
      )}
    </div>
  );
}

const TONES = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  rose: { bg: "bg-rose-50", text: "text-rose-600" },
} as const;

function KpiCard({
  icon,
  label,
  value,
  tone,
  signed,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: keyof typeof TONES;
  signed?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div className="shrink-0 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border border-gray-100 bg-white">
      <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${t.bg} ${t.text}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5 whitespace-nowrap">
          {label}
        </p>
        <p className={`text-[14px] font-bold tabular-nums whitespace-nowrap ${t.text}`}>
          {signed && value < 0 ? "−" : ""}
          {fmtMoney(Math.abs(value))}
        </p>
      </div>
    </div>
  );
}

function AccountCard({
  icon,
  label,
  in: inAmt,
  out: outAmt,
  balance,
  warn,
}: {
  icon: ReactNode;
  label: string;
  in: number;
  out: number;
  balance?: number;
  warn?: boolean;
}) {
  return (
    <div
      className={`shrink-0 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border ${
        warn ? "border-amber-200 bg-amber-50/50" : "border-gray-100 bg-white"
      }`}
    >
      <div
        className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
          warn ? "bg-amber-100 text-amber-600" : "bg-primary-soft text-primary"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5 truncate max-w-[130px]">
          {label}
        </p>
        <p className="text-[12px] tabular-nums whitespace-nowrap">
          <span className="text-emerald-600 font-semibold">In {fmtMoney(inAmt)}</span>
          <span className="text-gray-300 mx-1.5">·</span>
          <span className="text-rose-600 font-semibold">Out {fmtMoney(outAmt)}</span>
          {balance !== undefined && (
            <>
              <span className="text-gray-300 mx-1.5">·</span>
              <span className="text-gray-600">Bal {fmtMoney(balance)}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function TotalPill({
  icon,
  label,
  value,
  tone,
  signed,
  emphasized,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: keyof typeof TONES;
  signed?: boolean;
  emphasized?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div
      className={`shrink-0 flex items-center gap-2.5 px-4 py-2.5 rounded-lg border bg-white ${
        emphasized ? "border-primary/20 shadow-sm" : "border-gray-200"
      }`}
    >
      <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${t.bg} ${t.text}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5 whitespace-nowrap">
          {label}
        </p>
        <p className={`text-[16px] font-bold tabular-nums whitespace-nowrap ${t.text}`}>
          {signed && value < 0 ? "−" : ""}
          {fmtMoney(Math.abs(value))}
        </p>
      </div>
    </div>
  );
}

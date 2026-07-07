import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  SalesRepo,
  PurchaseRepo,
  ExpenseRepo,
  PartyRepo,
  ItemRepo,
  SaleReturnRepo,
  PurchaseReturnRepo,
  PaymentRepo,
  CompanyRepo,
} from "@/repositories";
import { fmtMoney, fmtDate, today, ymd } from "@/lib/format";
import { printWithName } from "@/lib/print";
import { computeCogs, buildPartyStatement } from "@/lib/ledger";
import { downloadCsv } from "@/lib/csv";
import { downloadXlsx } from "@/lib/xlsx";
import { downloadElementAsPdf, shareElementAsPdf } from "@/lib/pdf";
import { partyStatementSheet } from "@/lib/partySheet";
import { PartyStatementRowBlock } from "./parties_.$id";
import { fmtMode } from "@/components/ModePills";
import { toast } from "sonner";
import {
  FileText,
  BarChart3,
  Users,
  Package,
  Wallet,
  RefreshCcw,
  Printer,
  Download,
  FileDown,
  Share2,
  Search,
  Calendar,
} from "lucide-react";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
  validateSearch: (search: Record<string, unknown>): { r?: string } => ({
    r: typeof search.r === "string" ? search.r : undefined,
  }),
});

const monthStart = () => ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

const REPORTS = [
  { key: "pl", label: "Profit & Loss", icon: BarChart3, desc: "Revenue, costs, net profit" },
  { key: "sales", label: "Sales Report", icon: FileText, desc: "Invoice-wise sales" },
  { key: "purchase", label: "Purchase Report", icon: FileText, desc: "Bill-wise purchases" },
  { key: "sale-return", label: "Sale Returns", icon: RefreshCcw, desc: "Credit notes issued" },
  {
    key: "purchase-return",
    label: "Purchase Returns",
    icon: RefreshCcw,
    desc: "Debit notes issued",
  },
  { key: "payments", label: "Payments Ledger", icon: Wallet, desc: "All payment in/out" },
  { key: "gst", label: "GST Summary", icon: BarChart3, desc: "Output vs input tax" },
  {
    key: "party-ledger",
    label: "Party Ledger",
    icon: Users,
    desc: "Full statement per party — sales, purchases, returns & payments",
  },
  { key: "stock", label: "Stock Report", icon: Package, desc: "Item-wise stock & value" },
  { key: "daily", label: "Today's Summary", icon: BarChart3, desc: "Today's activity" },
];

function ReportsPage() {
  const { r } = Route.useSearch();
  const [active, setActive] = useState(REPORTS.some((x) => x.key === r) ? (r as string) : "pl");
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [pdfBusy, setPdfBusy] = useState<"download" | "share" | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const current = REPORTS.find((r) => r.key === active);
  const reportFilename = () =>
    `${(current?.label ?? "Report").replace(/\s+/g, "-")}-${dateFrom}-to-${dateTo}`;

  const handleDownloadPdf = async () => {
    if (!printRef.current || pdfBusy) return;
    setPdfBusy("download");
    try {
      await downloadElementAsPdf(printRef.current, reportFilename(), "landscape");
      toast.success("Report downloaded as PDF");
    } catch {
      toast.error("Could not generate PDF — try Print instead");
    } finally {
      setPdfBusy(null);
    }
  };

  const handleShare = async () => {
    if (!printRef.current || pdfBusy) return;
    setPdfBusy("share");
    try {
      const result = await shareElementAsPdf(printRef.current, reportFilename(), "landscape");
      if (result === "shared") toast.success("Report shared");
      else if (result === "downloaded")
        toast.info("Sharing isn't supported here — PDF downloaded instead");
    } catch {
      toast.error("Could not share report — try Download PDF instead");
    } finally {
      setPdfBusy(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f7f7f9]">
      <div className="bg-white border-b px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap no-print">
        <div className="flex items-center gap-2.5">
          <BarChart3 className="h-5 w-5 text-primary shrink-0" />
          <div>
            <h1 className="text-[17px] font-bold text-gray-800 leading-tight">Reports</h1>
            <p className="text-[12px] text-gray-400 leading-tight">{current?.desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-lg border border-gray-200 bg-gray-50/60">
            <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent text-xs text-gray-700 focus:outline-none w-[104px]"
            />
            <span className="text-gray-300 text-xs">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent text-xs text-gray-700 focus:outline-none w-[104px]"
            />
          </div>
          <button
            onClick={handleDownloadPdf}
            disabled={pdfBusy !== null}
            className="h-9 w-9 shrink-0 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:shadow-sm text-gray-600 flex items-center justify-center transition disabled:opacity-50"
            title="Download report as PDF"
          >
            <FileDown className="h-4 w-4" />
          </button>
          <button
            onClick={handleShare}
            disabled={pdfBusy !== null}
            className="h-9 w-9 shrink-0 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:shadow-sm text-gray-600 flex items-center justify-center transition disabled:opacity-50"
            title="Share report PDF"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => printWithName(reportFilename())}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:shadow-sm transition"
            title="Print"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside className="w-56 border-r bg-white overflow-y-auto shrink-0 no-print p-2">
          {REPORTS.map((r) => {
            const Icon = r.icon;
            const isActive = active === r.key;
            return (
              <button
                key={r.key}
                onClick={() => setActive(r.key)}
                className={`w-full text-left mb-0.5 px-3 py-2.5 rounded-lg flex items-center gap-2.5 transition ${isActive ? "bg-primary-soft text-primary font-semibold" : "hover:bg-gray-50 text-gray-600"}`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-gray-400"}`}
                />
                <p className="text-[12.5px] truncate">{r.label}</p>
              </button>
            );
          })}
        </aside>

        {/* Report content (print-area so Print/PDF/Share all capture exactly this) */}
        <div ref={printRef} className="flex-1 overflow-auto p-6 print-visible print:p-6">
          <ReportView which={active} dateFrom={dateFrom} dateTo={dateTo} />
        </div>
      </div>
    </div>
  );
}

function inRange(date: string, from: string, to: string) {
  return (!from || date >= from) && (!to || date <= to);
}

function ReportView({
  which,
  dateFrom,
  dateTo,
}: {
  which: string;
  dateFrom: string;
  dateTo: string;
}) {
  const label = REPORTS.find((r) => r.key === which)?.label ?? which;
  const navigate = useNavigate();

  const sales = useMemo(
    () => SalesRepo.all().filter((s) => inRange(s.date, dateFrom, dateTo)),
    [dateFrom, dateTo],
  );
  const purchases = useMemo(
    () => PurchaseRepo.all().filter((s) => inRange(s.date, dateFrom, dateTo)),
    [dateFrom, dateTo],
  );
  const expenses = useMemo(
    () => ExpenseRepo.all().filter((s) => inRange(s.date, dateFrom, dateTo)),
    [dateFrom, dateTo],
  );
  const saleReturns = useMemo(
    () => SaleReturnRepo.all().filter((s) => inRange(s.date, dateFrom, dateTo)),
    [dateFrom, dateTo],
  );
  const purchaseReturns = useMemo(
    () => PurchaseReturnRepo.all().filter((s) => inRange(s.date, dateFrom, dateTo)),
    [dateFrom, dateTo],
  );
  const payments = useMemo(
    () => PaymentRepo.all().filter((s) => inRange(s.date, dateFrom, dateTo)),
    [dateFrom, dateTo],
  );
  const parties = useMemo(() => PartyRepo.all(), []);
  const items = useMemo(() => ItemRepo.all(), []);
  const [partySearch, setPartySearch] = useState("");

  if (which === "pl") {
    const revenue = sales.reduce((a, s) => a + s.total, 0);
    const saleReturnTotal = saleReturns.reduce((a, r) => a + r.total, 0);
    const netRevenue = revenue - saleReturnTotal;
    // Stock-based COGS: cost of items actually sold (net of returned goods),
    // not total purchases — unsold stock does not reduce profit.
    const cogs = computeCogs(sales, saleReturns, items);
    const purchaseTotal = purchases.reduce((a, s) => a + s.total, 0);
    const purchaseReturnTotal = purchaseReturns.reduce((a, r) => a + r.total, 0);
    const netPurchases = purchaseTotal - purchaseReturnTotal;
    const grossProfit = netRevenue - cogs;
    const exp = expenses.reduce((a, s) => a + s.amount, 0);
    const netProfit = grossProfit - exp;

    return (
      <div className="max-w-2xl">
        <h2 className="text-lg font-bold text-gray-800 mb-4">{label}</h2>
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue</p>
          </div>
          <PLRow label="Sales Revenue" value={revenue} />
          <PLRow label="Sale Returns (−)" value={-saleReturnTotal} indent />
          <PLRow label="Net Revenue" value={netRevenue} bold />
          <div className="px-5 py-3 bg-gray-50 border-b border-t">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Cost of Goods Sold
            </p>
          </div>
          <PLRow label="Cost of Goods Sold (item cost of sold qty)" value={-cogs} bold />
          <div className="px-5 py-2 flex justify-between items-center border-b border-gray-100 text-[11px] text-gray-400">
            <span className="pl-4">
              Purchases during period (net of returns) — for reference, not in profit
            </span>
            <span className="tabular-nums">{fmtMoney(netPurchases)}</span>
          </div>
          <div className="px-5 py-3 bg-gray-50 border-b border-t">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Gross Profit
            </p>
          </div>
          <PLRow
            label="Gross Profit"
            value={grossProfit}
            bold
            large
            className={grossProfit >= 0 ? "text-emerald-600" : "text-rose-600"}
          />
          <div className="px-5 py-3 bg-gray-50 border-b border-t">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Expenses</p>
          </div>
          <PLRow label="Operating Expenses" value={-exp} />
          <div className="px-5 py-4 bg-primary/5 border-t-2 border-primary flex justify-between items-center">
            <span className="text-base font-bold text-gray-800">Net Profit</span>
            <span
              className={`text-[20px] font-extrabold tabular-nums ${netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {fmtMoney(netProfit)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (which === "sales") {
    const total = sales.reduce((a, s) => a + s.total, 0);
    const paid = sales.reduce((a, s) => a + s.paid, 0);
    return (
      <TableReport
        label={label}
        totalRows={[
          ["Total", fmtMoney(total)],
          ["Collected", fmtMoney(paid)],
          ["Outstanding", fmtMoney(total - paid)],
        ]}
        cols={["Invoice #", "Date", "Customer", "Mode", "Total", "Paid", "Balance", "Status"]}
        rows={sales
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((s) => {
            const bal = Math.max(0, s.total - s.paid);
            const status = bal <= 0 ? "Paid" : s.paid > 0 ? "Partial" : "Unpaid";
            return [
              s.number,
              fmtDate(s.date),
              s.partyName,
              fmtMode(s.paymentMode),
              fmtMoney(s.total),
              fmtMoney(s.paid),
              fmtMoney(bal),
              status,
            ];
          })}
      />
    );
  }

  if (which === "purchase") {
    const total = purchases.reduce((a, s) => a + s.total, 0);
    const paid = purchases.reduce((a, s) => a + s.paid, 0);
    return (
      <TableReport
        label={label}
        totalRows={[
          ["Total", fmtMoney(total)],
          ["Paid", fmtMoney(paid)],
          ["Payable", fmtMoney(total - paid)],
        ]}
        cols={["Bill #", "Date", "Supplier", "Mode", "Total", "Paid", "Balance", "Status"]}
        rows={purchases
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((s) => {
            const bal = Math.max(0, s.total - s.paid);
            const status = bal <= 0 ? "Paid" : s.paid > 0 ? "Partial" : "Unpaid";
            return [
              s.number,
              fmtDate(s.date),
              s.partyName,
              fmtMode(s.paymentMode),
              fmtMoney(s.total),
              fmtMoney(s.paid),
              fmtMoney(bal),
              status,
            ];
          })}
      />
    );
  }

  if (which === "sale-return") {
    const total = saleReturns.reduce((a, r) => a + r.total, 0);
    return (
      <TableReport
        label={label}
        totalRows={[["Total Credit", fmtMoney(total)]]}
        cols={["Credit Note #", "Date", "Original Ref", "Customer", "Items", "Total"]}
        rows={saleReturns
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((r) => [
            r.number,
            fmtDate(r.date),
            r.originalRef || "—",
            r.partyName,
            String(r.lineItems.length),
            fmtMoney(r.total),
          ])}
      />
    );
  }

  if (which === "purchase-return") {
    const total = purchaseReturns.reduce((a, r) => a + r.total, 0);
    return (
      <TableReport
        label={label}
        totalRows={[["Total Debit", fmtMoney(total)]]}
        cols={["Debit Note #", "Date", "Original Ref", "Supplier", "Items", "Total"]}
        rows={purchaseReturns
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((r) => [
            r.number,
            fmtDate(r.date),
            r.originalRef || "—",
            r.partyName,
            String(r.lineItems.length),
            fmtMoney(r.total),
          ])}
      />
    );
  }

  if (which === "payments") {
    const totalIn = payments.filter((p) => p.type === "in").reduce((a, p) => a + p.amount, 0);
    const totalOut = payments.filter((p) => p.type === "out").reduce((a, p) => a + p.amount, 0);
    return (
      <TableReport
        label={label}
        totalRows={[
          ["Received (In)", fmtMoney(totalIn)],
          ["Paid (Out)", fmtMoney(totalOut)],
          ["Net", fmtMoney(totalIn - totalOut)],
        ]}
        cols={["Date", "Type", "Party", "Mode", "Reference", "Amount"]}
        rows={payments
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((p) => [
            fmtDate(p.date),
            p.type === "in" ? "In" : "Out",
            p.partyName,
            fmtMode(p.mode),
            p.ref || "—",
            `${p.type === "in" ? "+" : "−"}${fmtMoney(p.amount)}`,
          ])}
      />
    );
  }

  if (which === "gst") {
    const agg = (all: any[]) => {
      // Only GST bills belong in GST returns
      const invoices = all.filter((inv) => inv.gstEnabled !== false);
      const map = new Map<number, { taxable: number; cgst: number; sgst: number }>();
      invoices.forEach((inv) =>
        inv.lineItems.forEach((l: any) => {
          // Guard against legacy/imported line items missing a numeric field —
          // one bad record must not turn the whole GST summary into NaN.
          const qty = l.qty ?? 0;
          const price = l.price ?? 0;
          const discountPct = l.discountPct ?? 0;
          const gstRate = l.gstRate ?? 0;
          const taxable = qty * price * (1 - discountPct / 100);
          const tax = taxable * (gstRate / 100);
          const cur = map.get(gstRate) ?? { taxable: 0, cgst: 0, sgst: 0 };
          map.set(gstRate, {
            taxable: cur.taxable + taxable,
            cgst: cur.cgst + tax / 2,
            sgst: cur.sgst + tax / 2,
          });
        }),
      );
      return Array.from(map, ([rate, v]) => ({ rate, ...v })).sort((a, b) => a.rate - b.rate);
    };
    const outRows = agg(sales);
    const inRows = agg(purchases);
    const outTax = outRows.reduce((a, r) => a + r.cgst + r.sgst, 0);
    const inTax = inRows.reduce((a, r) => a + r.cgst + r.sgst, 0);

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-4xl">
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-3">GSTR-1 — Output Tax (Sales)</h2>
          <TableReport
            label=""
            totalRows={[["Total Output Tax", fmtMoney(outTax)]]}
            cols={["GST Rate", "Taxable Value", "CGST", "SGST", "Total Tax"]}
            rows={outRows.map((r) => [
              `${r.rate}%`,
              fmtMoney(r.taxable),
              fmtMoney(r.cgst),
              fmtMoney(r.sgst),
              fmtMoney(r.cgst + r.sgst),
            ])}
          />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-3">GSTR-2 — Input Tax (Purchase)</h2>
          <TableReport
            label=""
            totalRows={[
              ["Total Input Tax", fmtMoney(inTax)],
              ["Net GST Payable", fmtMoney(outTax - inTax)],
            ]}
            cols={["GST Rate", "Taxable Value", "CGST", "SGST", "Total Tax"]}
            rows={inRows.map((r) => [
              `${r.rate}%`,
              fmtMoney(r.taxable),
              fmtMoney(r.cgst),
              fmtMoney(r.sgst),
              fmtMoney(r.cgst + r.sgst),
            ])}
          />
        </div>
      </div>
    );
  }

  if (which === "party-ledger") {
    // Every party is both customer & supplier now — one combined statement
    // (sales, purchases, returns, payments, running balance, and each
    // transaction's own item breakdown) per party, instead of splitting by a
    // customer/supplier field that no longer means anything. Always built
    // from FULL history — dateFrom/dateTo only control the visible window
    // inside buildPartyStatement (via a proper "Balance b/f" line), same as
    // the per-party Statement page.
    const data = {
      sales: SalesRepo.all(),
      purchases: PurchaseRepo.all(),
      saleReturns: SaleReturnRepo.all(),
      purchaseReturns: PurchaseReturnRepo.all(),
      payments: PaymentRepo.all(),
    };
    const perPartyAll = parties
      .map((p) => ({ party: p, ledger: buildPartyStatement(p, data, dateFrom, dateTo) }))
      .filter(({ ledger }) => ledger.rows.length > 0)
      .sort((a, b) => a.party.name.localeCompare(b.party.name));
    const q = partySearch.trim().toLowerCase();
    const perParty = q
      ? perPartyAll.filter(({ party: p }) => p.name.toLowerCase().includes(q))
      : perPartyAll;

    const closingOf = (rows: { balance: number }[]) => (rows.length ? rows[rows.length - 1].balance : 0);
    const totalReceivable = perParty.reduce(
      (s, { ledger }) => s + Math.max(0, closingOf(ledger.rows)),
      0,
    );
    const totalPayable = perParty.reduce(
      (s, { ledger }) => s + Math.max(0, -closingOf(ledger.rows)),
      0,
    );
    const fmtBal = (n: number) => `${fmtMoney(Math.abs(n))}${n > 0 ? " Dr" : n < 0 ? " Cr" : ""}`;

    if (perPartyAll.length === 0) {
      return (
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-3">{label}</h2>
          <div className="bg-white border rounded-lg p-8 text-center text-gray-400">
            <FileText className="h-8 w-8 mx-auto mb-2 text-gray-200" />
            <p>No party activity for selected date range</p>
          </div>
        </div>
      );
    }

    const company = CompanyRepo.get();
    const periodLabel = `${dateFrom ? fmtDate(dateFrom) : "Beginning"} to ${dateTo ? fmtDate(dateTo) : "Today"}`;
    const sheets = perParty.map(({ party: p, ledger }) =>
      partyStatementSheet(p, ledger.rows, company, periodLabel),
    );

    const openRow = (r: { docId?: string; docKind?: string }) => {
      if (!r.docId || !r.docKind) return;
      if (r.docKind === "sale") navigate({ to: "/sales/$id", params: { id: r.docId } });
      else if (r.docKind === "purchase") navigate({ to: "/purchase/$id", params: { id: r.docId } });
      else if (r.docKind === "sale-return")
        navigate({ to: "/sale-return/$id", params: { id: r.docId } });
      else navigate({ to: "/purchase-return/$id", params: { id: r.docId } });
    };

    return (
      <div>
        {/* Each party's table is 9 columns wide plus a nested item
            breakdown — too wide for portrait A4, so it gets cut off at the
            right edge when printed. Landscape gives it room to fit. */}
        <style>{`@media print { @page { size: A4 landscape; margin: 12mm; } }`}</style>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-800">{label}</h2>
          <button
            onClick={() => downloadXlsx("Party Ledger", sheets)}
            className="no-print inline-flex items-center gap-1.5 h-8 px-3 bg-white border border-gray-200 rounded-md text-xs font-semibold text-gray-600 hover:bg-gray-50 transition"
          >
            <Download className="h-3.5 w-3.5" /> Export Excel (one sheet per party)
          </button>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-2 bg-white border rounded-lg px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500">Total Receivable:</span>
            <span className="text-sm font-bold text-rose-600 tabular-nums">
              {fmtMoney(totalReceivable)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500">Total Payable:</span>
            <span className="text-sm font-bold text-amber-600 tabular-nums">
              {fmtMoney(totalPayable)}
            </span>
          </div>
          <div className="no-print flex items-center gap-1.5 border border-gray-200 rounded-md px-2.5 py-1.5 bg-white flex-1 max-w-xs ml-auto">
            <Search className="h-3.5 w-3.5 text-gray-400" />
            <input
              value={partySearch}
              onChange={(e) => setPartySearch(e.target.value)}
              placeholder="Search party…"
              className="text-xs flex-1 outline-none placeholder-gray-400 bg-transparent"
            />
          </div>
        </div>
        {perParty.length === 0 && (
          <div className="bg-white border rounded-lg p-8 text-center text-gray-400 mb-4">
            <Search className="h-8 w-8 mx-auto mb-2 text-gray-200" />
            <p>No party matches "{partySearch}"</p>
          </div>
        )}
        <div className="space-y-4">
          {perParty.map(({ party: p, ledger }) => {
            const closing = closingOf(ledger.rows);
            return (
              <div
                key={p.id}
                className="bg-white border rounded-lg shadow-sm overflow-hidden"
                style={{ breakInside: "avoid" }}
              >
                <div className="px-4 py-2.5 bg-gray-50 border-b flex items-center justify-between gap-3">
                  <button
                    onClick={() => navigate({ to: "/parties/$id", params: { id: p.id } })}
                    className="no-print font-bold text-sm text-gray-800 hover:text-primary hover:underline text-left"
                    title="Open full party statement"
                  >
                    {p.name}
                  </button>
                  <span className="hidden print:inline font-bold text-sm text-gray-800">
                    {p.name}
                  </span>
                  <span
                    className={`text-xs font-bold tabular-nums ${closing > 0 ? "text-rose-600" : closing < 0 ? "text-amber-600" : "text-gray-500"}`}
                  >
                    Closing: {fmtBal(closing)}
                  </span>
                </div>
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr className="bg-gray-50/60">
                      {[
                        "Date",
                        "Txn Type",
                        "Ref No.",
                        "Payment Status",
                        "Total",
                        "Received/Paid",
                        "Txn Balance",
                        "Receivable Balance",
                        "Payable Balance",
                      ].map((h, i) => (
                        <th
                          key={h}
                          className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100 whitespace-nowrap ${i >= 4 ? "text-right" : "text-left"}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.rows.map((r, i) => (
                      <PartyStatementRowBlock key={i} row={r} onOpen={() => openRow(r)} />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                      <td colSpan={7} className="px-3 py-2.5 text-[10px] uppercase text-gray-500">
                        Closing Balance
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-rose-600">
                        {closing > 0 ? fmtMoney(closing) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">
                        {closing < 0 ? fmtMoney(-closing) : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (which === "stock") {
    const totalValue = items.reduce((a, i) => a + i.stock * i.purchasePrice, 0);
    const lowStock = items.filter(
      (i) => (i.minStock != null && i.stock <= i.minStock) || i.stock < 0,
    ).length;
    return (
      <TableReport
        label={label}
        totalRows={[
          ["Total Stock Value", fmtMoney(totalValue)],
          ["Low Stock Items", String(lowStock)],
        ]}
        cols={[
          "Item",
          "SKU",
          "Category",
          "Stock",
          "Unit",
          "Min Stock",
          "Purchase Price",
          "Sale Price",
          "Stock Value",
        ]}
        rows={items
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((i) => [
            i.name,
            i.sku || "—",
            i.category || "—",
            String(i.stock),
            i.unit,
            i.minStock ? String(i.minStock) : "—",
            fmtMoney(i.purchasePrice),
            fmtMoney(i.salePrice),
            fmtMoney(i.stock * i.purchasePrice),
          ])}
      />
    );
  }

  if (which === "daily") {
    const t = today();
    const todaySales = SalesRepo.all().filter((x) => x.date === t);
    const todayPurchases = PurchaseRepo.all().filter((x) => x.date === t);
    const todayExpenses = ExpenseRepo.all().filter((x) => x.date === t);
    const todayPayIn = PaymentRepo.all().filter((x) => x.date === t && x.type === "in");
    const todayPayOut = PaymentRepo.all().filter((x) => x.date === t && x.type === "out");
    const s = todaySales.reduce((a, b) => a + b.total, 0);
    const p = todayPurchases.reduce((a, b) => a + b.total, 0);
    const e = todayExpenses.reduce((a, b) => a + b.amount, 0);
    const pi = todayPayIn.reduce((a, b) => a + b.amount, 0);
    const po = todayPayOut.reduce((a, b) => a + b.amount, 0);

    return (
      <div className="max-w-lg">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Today's Summary — {fmtDate(t)}</h2>
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <PLRow label="Sales" value={s} positive />
          <PLRow label="Payment In" value={pi} positive />
          <PLRow label="Purchase" value={-p} />
          <PLRow label="Expenses" value={-e} />
          <PLRow label="Payment Out" value={-po} />
          <div className="px-5 py-4 bg-primary/5 border-t-2 border-primary flex justify-between items-center">
            <span className="text-base font-bold">Net Cash Flow</span>
            <span
              className={`text-[20px] font-extrabold tabular-nums ${s + pi - p - e - po >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {fmtMoney(s + pi - p - e - po)}
            </span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label="Invoices"
            value={todaySales.length}
            sub="created"
            color="text-blue-600"
          />
          <StatCard
            label="Bills"
            value={todayPurchases.length}
            sub="created"
            color="text-gray-600"
          />
          <StatCard
            label="Expenses"
            value={todayExpenses.length}
            sub="recorded"
            color="text-rose-600"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="text-muted-foreground text-sm p-4">Select a report from the left panel.</div>
  );
}

function PLRow({
  label,
  value,
  bold,
  large,
  indent,
  positive,
  className = "",
}: {
  label: string;
  value: number;
  bold?: boolean;
  large?: boolean;
  indent?: boolean;
  positive?: boolean;
  className?: string;
}) {
  const isPos = positive ? value >= 0 : value >= 0;
  const display = fmtMoney(Math.abs(value));
  const prefix = value < 0 ? "−" : "";
  return (
    <div
      className={`px-5 py-3 flex justify-between items-center border-b border-gray-100 ${bold ? "bg-gray-50" : ""}`}
    >
      <span
        className={`text-sm ${indent ? "pl-4 text-gray-500" : "text-gray-700"} ${bold ? "font-bold" : ""} ${large ? "text-base" : ""}`}
      >
        {label}
      </span>
      <span
        className={`tabular-nums text-sm ${bold ? "font-bold" : "font-medium"} ${large ? "text-base" : ""} ${className || (isPos && !positive && value === 0 ? "text-gray-400" : value < 0 ? "text-rose-600" : value > 0 && positive ? "text-emerald-600" : "text-gray-800")}`}
      >
        {prefix}
        {display}
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number;
  sub: string;
  color: string;
}) {
  return (
    <div className="bg-white border rounded-lg p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">
        {label} {sub}
      </p>
    </div>
  );
}

function TableReport({
  label,
  cols,
  rows,
  totalRows,
}: {
  label: string;
  cols: string[];
  rows: string[][];
  totalRows: [string, string][];
}) {
  if (rows.length === 0) {
    return (
      <div>
        {label && <h2 className="text-base font-bold text-gray-800 mb-3">{label}</h2>}
        <div className="bg-white border border-gray-200/80 rounded-xl shadow-card p-10 text-center text-gray-400">
          <FileText className="h-8 w-8 mx-auto mb-2 text-gray-200" />
          <p>No data for selected date range</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-800">{label}</h2>
          <button
            onClick={() => downloadCsv(label, cols, rows)}
            className="no-print inline-flex items-center gap-1.5 h-8 px-3 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:shadow-sm transition"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      )}
      <div className="bg-white border border-gray-200/80 rounded-xl shadow-card overflow-hidden">
        <div className="data-table overflow-auto max-h-[calc(100vh-300px)]">
          <table className="w-full text-[12.5px] min-w-max">
            <thead>
              <tr>
                {cols.map((c, i) => (
                  <th key={c} style={{ textAlign: i > 0 ? "right" : "left" }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{ textAlign: ci === 0 ? "left" : "right" }}
                      className={ci === 0 ? "font-medium text-gray-800" : "text-gray-700 tabular-nums"}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalRows.length > 0 && (
          <div className="border-t border-gray-200/80 bg-gray-50/60 px-5 py-3 flex flex-wrap items-center gap-3">
            {totalRows.map(([k, v], i) => (
              <div key={i} className="flex items-center gap-3">
                {i > 0 && <span className="text-gray-300">•</span>}
                {k && <span className="text-xs font-semibold text-gray-500">{k}</span>}
                <span className="text-gray-300">|</span>
                <span className="text-sm font-bold text-gray-800 tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

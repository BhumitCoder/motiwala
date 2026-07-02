import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  SalesRepo,
  PurchaseRepo,
  ExpenseRepo,
  PartyRepo,
  ItemRepo,
  SaleReturnRepo,
  PurchaseReturnRepo,
  PaymentRepo,
} from "@/repositories";
import { fmtMoney, fmtDate, today, ymd } from "@/lib/format";
import { printWithName } from "@/lib/print";
import { partyBalances, computeCogs } from "@/lib/ledger";
import {
  FileText,
  BarChart3,
  Users,
  Package,
  Wallet,
  RefreshCcw,
  Printer,
  Download,
} from "lucide-react";

/** Download rows as Excel-friendly CSV — money cells become plain numbers */
function downloadCsv(name: string, cols: string[], rows: string[][]) {
  const clean = (s: string) => {
    const t = String(s)
      .replace(/[\u00A0\u202F]/g, " ")
      .trim();
    const m = t.match(/^([+\-−]?)\s*₹\s?([\d,]+(?:\.\d+)?)$/);
    const v = m ? `${m[1] === "−" || m[1] === "-" ? "-" : ""}${m[2].replace(/,/g, "")}` : t;
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const csv = "\uFEFF" + [cols, ...rows].map((r) => r.map(clean).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.toLowerCase().replace(/\s+/g, "-")}-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
  validateSearch: (search: Record<string, unknown>): { r?: string } => ({
    r: typeof search.r === "string" ? search.r : undefined,
  }),
});

const THIS_MONTH_START = ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

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
    key: "customer-ledger",
    label: "Customer Ledger",
    icon: Users,
    desc: "Receivable per customer",
  },
  { key: "supplier-ledger", label: "Supplier Ledger", icon: Users, desc: "Payable per supplier" },
  { key: "stock", label: "Stock Report", icon: Package, desc: "Item-wise stock & value" },
  { key: "daily", label: "Today's Summary", icon: BarChart3, desc: "Today's activity" },
];

function ReportsPage() {
  const { r } = Route.useSearch();
  const [active, setActive] = useState(REPORTS.some((x) => x.key === r) ? (r as string) : "pl");
  const [dateFrom, setDateFrom] = useState(THIS_MONTH_START);
  const [dateTo, setDateTo] = useState(today());

  const current = REPORTS.find((r) => r.key === active);

  return (
    <div className="flex flex-col h-full bg-[#f5f6fa]">
      <div className="bg-white border-b px-5 py-3 flex items-center justify-between gap-3 no-print">
        <div>
          <h1 className="text-[17px] font-bold text-gray-800">Reports</h1>
          <p className="text-[12px] text-gray-400">{current?.desc}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-md text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <label className="text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-md text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            onClick={() =>
              printWithName(
                `${(current?.label ?? "Report").replace(/\s+/g, "-")}-${dateFrom}-to-${dateTo}`,
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-md text-xs font-semibold text-gray-600 hover:bg-gray-50 transition"
            title="Print, or choose 'Save as PDF' in the print dialog"
          >
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside className="w-52 border-r bg-white overflow-y-auto shrink-0 no-print">
          {REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <button
                key={r.key}
                onClick={() => setActive(r.key)}
                className={`w-full text-left px-3 py-2.5 border-b border-gray-100 flex items-center gap-2.5 transition ${active === r.key ? "bg-primary/5 border-l-2 border-l-primary font-semibold text-primary" : "hover:bg-gray-50 text-gray-700"}`}
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${active === r.key ? "text-primary" : "text-gray-400"}`}
                />
                <div className="min-w-0">
                  <p className="text-[12px] truncate">{r.label}</p>
                  <p className="text-[10px] text-gray-400 truncate hidden">{r.desc}</p>
                </div>
              </button>
            );
          })}
        </aside>

        {/* Report content (print-area so Print/PDF captures exactly this) */}
        <div className="flex-1 overflow-auto p-5 print-visible print:p-6">
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
              s.paymentMode,
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
              s.paymentMode,
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
            p.mode,
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
          const taxable = l.qty * l.price * (1 - l.discountPct / 100);
          const tax = taxable * (l.gstRate / 100);
          const cur = map.get(l.gstRate) ?? { taxable: 0, cgst: 0, sgst: 0 };
          map.set(l.gstRate, {
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

  if (which === "customer-ledger") {
    const rows = partyBalances(
      SalesRepo.all(),
      SaleReturnRepo.all(),
      PaymentRepo.all().filter((p) => p.type === "in"),
    )
      .filter((r) => Math.abs(r.balance) > 0.01)
      .sort((a, b) => b.balance - a.balance);
    const totalReceivable = rows.reduce((a, r) => a + Math.max(0, r.balance), 0);
    const totalAdvances = rows.reduce((a, r) => a + Math.max(0, -r.balance), 0);

    return (
      <TableReport
        label={`Customer Ledger`}
        totalRows={[
          ["Total Receivable", fmtMoney(totalReceivable)],
          ["Customer Advances", fmtMoney(totalAdvances)],
        ]}
        cols={["Customer", "Total Sales", "Returns", "Collected", "Balance"]}
        rows={rows.map((r) => [
          r.name,
          fmtMoney(r.invoiced),
          fmtMoney(r.returned),
          fmtMoney(r.settled + r.advances),
          fmtMoney(r.balance),
        ])}
      />
    );
  }

  if (which === "supplier-ledger") {
    const rows = partyBalances(
      PurchaseRepo.all(),
      PurchaseReturnRepo.all(),
      PaymentRepo.all().filter((p) => p.type === "out"),
    )
      .filter((r) => Math.abs(r.balance) > 0.01)
      .sort((a, b) => b.balance - a.balance);
    const totalPayable = rows.reduce((a, r) => a + Math.max(0, r.balance), 0);
    const totalAdvances = rows.reduce((a, r) => a + Math.max(0, -r.balance), 0);

    return (
      <TableReport
        label={`Supplier Ledger`}
        totalRows={[
          ["Total Payable", fmtMoney(totalPayable)],
          ["Advances to Suppliers", fmtMoney(totalAdvances)],
        ]}
        cols={["Supplier", "Total Purchase", "Returns", "Paid", "Balance"]}
        rows={rows.map((r) => [
          r.name,
          fmtMoney(r.invoiced),
          fmtMoney(r.returned),
          fmtMoney(r.settled + r.advances),
          fmtMoney(r.balance),
        ])}
      />
    );
  }

  if (which === "stock") {
    const totalValue = items.reduce((a, i) => a + i.stock * i.purchasePrice, 0);
    const lowStock = items.filter((i) => i.minStock && i.stock <= i.minStock).length;
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
        <div className="mt-4 grid grid-cols-3 gap-3">
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
        <div className="bg-white border rounded-lg p-8 text-center text-gray-400">
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
            className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-md text-xs font-semibold text-gray-600 hover:bg-gray-50 transition"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      )}
      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-300px)]">
          <table className="w-full text-[12px] border-collapse min-w-max">
            <thead className="sticky top-0">
              <tr className="bg-gray-50">
                {cols.map((c, i) => (
                  <th
                    key={c}
                    className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200 whitespace-nowrap ${i > 0 ? "text-right" : "text-left"}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-gray-100 hover:bg-gray-50/70">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`px-4 py-2.5 ${ci === 0 ? "font-medium text-gray-800 text-left" : "text-right text-gray-700 tabular-nums"}`}
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
          <div className="border-t-2 border-gray-200 bg-gray-50 px-5 py-3 flex flex-wrap gap-x-8 gap-y-1">
            {totalRows.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">{k}:</span>
                <span className="text-sm font-bold text-gray-800 tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

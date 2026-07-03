import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  SalesRepo,
  PurchaseRepo,
  ExpenseRepo,
  PaymentRepo,
  SaleReturnRepo,
  PurchaseReturnRepo,
  CashAdjustmentRepo,
} from "@/repositories";
import { fmtMoney, fmtDate, today, ymd } from "@/lib/format";
import { printWithName } from "@/lib/print";
import { fmtMode } from "@/components/ModePills";
import { BookOpen, Printer, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/daybook")({ component: DaybookPage });

interface DayRow {
  created: string;
  type: string;
  ref: string;
  party: string;
  mode: string;
  amount: number; // + money in / business in, − money out
}

function DaybookPage() {
  const [date, setDate] = useState(today());

  const rows = useMemo<DayRow[]>(() => {
    const list: DayRow[] = [];
    for (const s of SalesRepo.all().filter((x) => x.date === date))
      list.push({
        created: s.createdAt,
        type: "Sale",
        ref: s.number,
        party: s.partyName,
        mode: s.paymentMode,
        amount: s.total,
      });
    for (const p of PurchaseRepo.all().filter((x) => x.date === date))
      list.push({
        created: p.createdAt,
        type: "Purchase",
        ref: p.number,
        party: p.partyName,
        mode: p.paymentMode,
        amount: -p.total,
      });
    for (const r of SaleReturnRepo.all().filter((x) => x.date === date))
      list.push({
        created: r.createdAt,
        type: "Sale Return",
        ref: r.number,
        party: r.partyName,
        mode: "—",
        amount: -r.total,
      });
    for (const r of PurchaseReturnRepo.all().filter((x) => x.date === date))
      list.push({
        created: r.createdAt,
        type: "Purchase Return",
        ref: r.number,
        party: r.partyName,
        mode: "—",
        amount: r.total,
      });
    for (const p of PaymentRepo.all().filter((x) => x.date === date))
      list.push({
        created: p.createdAt,
        type: p.type === "in" ? "Payment In" : "Payment Out",
        ref: p.allocations?.map((a) => a.number).join(", ") || p.ref || "—",
        party: p.partyName,
        mode: p.mode,
        amount: p.type === "in" ? p.amount : -p.amount,
      });
    for (const e of ExpenseRepo.all().filter((x) => x.date === date))
      list.push({
        created: e.createdAt,
        type: "Expense",
        ref: e.category,
        party: "—",
        mode: e.paymentMode,
        amount: -e.amount,
      });
    for (const a of CashAdjustmentRepo.all().filter((x) => x.date === date))
      list.push({
        created: a.createdAt,
        type: a.type === "add" ? "Cash Added" : "Cash Reduced",
        ref: a.reason || "Adjustment",
        party: "—",
        mode: "cash",
        amount: a.type === "add" ? a.amount : -a.amount,
      });
    list.sort((a, b) => (a.created ?? "").localeCompare(b.created ?? ""));
    return list;
  }, [date]);

  const sum = (type: string) =>
    rows.filter((r) => r.type === type).reduce((s, r) => s + Math.abs(r.amount), 0);
  const totalSale = sum("Sale");
  const totalPurchase = sum("Purchase");
  const payIn = sum("Payment In");
  const payOut = sum("Payment Out");
  const expense = sum("Expense");
  const net = rows.reduce((s, r) => s + r.amount, 0);

  const shiftDay = (delta: number) => {
    const [y, m, dd] = date.split("-").map(Number);
    const d = new Date(y, m - 1, dd + delta);
    setDate(ymd(d));
  };

  return (
    <div className="flex flex-col h-full bg-[#f5f6fa]">
      <div className="no-print bg-white border-b px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
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
        <div className="flex items-center gap-2">
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
            className="px-3 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-600"
          >
            Today
          </button>
          <button
            onClick={() => printWithName(`Daybook-${date}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-md text-xs font-semibold text-gray-600 hover:bg-gray-50"
            title="Print, or choose 'Save as PDF' in the print dialog"
          >
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="no-print grid grid-cols-3 lg:grid-cols-6 bg-white border-b">
        <Stat label="Sales" value={totalSale} color="text-emerald-600" />
        <Stat label="Payment In" value={payIn} color="text-emerald-600" />
        <Stat label="Purchase" value={totalPurchase} color="text-rose-600" />
        <Stat label="Payment Out" value={payOut} color="text-rose-600" />
        <Stat label="Expenses" value={expense} color="text-rose-600" />
        <Stat
          label="Net"
          value={net}
          color={net >= 0 ? "text-emerald-600" : "text-rose-600"}
          signed
        />
      </div>

      <div className="flex-1 overflow-auto p-5">
        <div className="print-visible bg-white border rounded-lg shadow-sm overflow-hidden max-w-5xl mx-auto print:p-6">
          <div className="px-5 py-3 border-b">
            <p className="text-sm font-bold text-gray-800">Daybook — {fmtDate(date)}</p>
          </div>
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {["#", "Type", "Ref / Category", "Party", "Mode", "Amount"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200 whitespace-nowrap ${i === 5 ? "text-right" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-14 text-gray-400">
                    No transactions on this day
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 text-gray-400 text-[11px]">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${r.amount >= 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}
                      >
                        {r.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-blue-600">{r.ref}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{r.party}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtMode(r.mode)}</td>
                    <td
                      className={`px-4 py-2.5 text-right font-bold tabular-nums ${r.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                    >
                      {r.amount >= 0 ? "+" : "−"}
                      {fmtMoney(Math.abs(r.amount))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                  <td colSpan={5} className="px-4 py-3 text-xs uppercase text-gray-500">
                    Net for the day
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${net >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                  >
                    {net >= 0 ? "+" : "−"}
                    {fmtMoney(Math.abs(net))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  signed,
}: {
  label: string;
  value: number;
  color: string;
  signed?: boolean;
}) {
  return (
    <div className="px-4 py-3 border-r border-gray-100 last:border-r-0">
      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">
        {label}
      </p>
      <p className={`text-[16px] font-bold tabular-nums ${color}`}>
        {signed && value < 0 ? "−" : ""}
        {fmtMoney(Math.abs(value))}
      </p>
    </div>
  );
}

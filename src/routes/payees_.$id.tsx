import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PayeeRepo, ExpenseRepo, BankRepo, CompanyRepo } from "@/repositories";
import { fmtMoney, fmtDate } from "@/lib/format";
import { printWithName } from "@/lib/print";
import { downloadElementAsPdf, shareElementAsPdf } from "@/lib/pdf";
import { downloadXlsx } from "@/lib/xlsx";
import { fmtMode } from "@/components/ModePills";
import type { Payee } from "@/types";
import { ArrowLeft, Printer, FileDown, Share2, Download, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/payees_/$id")({ component: PayeeLedgerPage });

const r2 = (n: number) => Math.round(n * 100) / 100;

function PayeeLedgerPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [payee, setPayee] = useState<Payee | null | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pdfBusy, setPdfBusy] = useState<"download" | "share" | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPayee(PayeeRepo.get(id) ?? null);
  }, [id]);

  const bankNameById = useMemo(() => new Map(BankRepo.all().map((b) => [b.id, b.name])), []);

  // Every expense ever paid to this payee, oldest first, with a running
  // total — same shape as the party ledgers, but one-directional (an
  // expense only ever adds to what's been paid, never reduces it).
  const allRows = useMemo(() => {
    if (!payee) return [];
    return ExpenseRepo.all()
      .filter((e) => e.payeeId === payee.id)
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  }, [payee]);

  const rows = useMemo(() => {
    let running = 0;
    const before = dateFrom ? allRows.filter((e) => e.date < dateFrom) : [];
    for (const e of before) running = r2(running + e.amount);
    const windowRows = allRows.filter(
      (e) => (!dateFrom || e.date >= dateFrom) && (!dateTo || e.date <= dateTo),
    );
    return windowRows.map((e) => {
      running = r2(running + e.amount);
      return { ...e, running };
    });
  }, [allRows, dateFrom, dateTo]);

  const totalPaid = rows.reduce((s, r) => s + r.amount, 0);
  const allTimeTotal = allRows.reduce((s, r) => s + r.amount, 0);

  const pdfName = () => `Payee-Ledger-${(payee?.name ?? "Payee").replace(/\s+/g, "-")}`;

  const handleDownloadPdf = async () => {
    if (!printRef.current || pdfBusy) return;
    setPdfBusy("download");
    try {
      await downloadElementAsPdf(printRef.current, pdfName(), "portrait");
      toast.success("Ledger downloaded as PDF");
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
      const result = await shareElementAsPdf(printRef.current, pdfName(), "portrait");
      if (result === "shared") toast.success("Ledger shared");
      else if (result === "downloaded")
        toast.info("Sharing isn't supported here — PDF downloaded instead");
    } catch {
      toast.error("Could not share ledger — try Download PDF instead");
    } finally {
      setPdfBusy(null);
    }
  };

  const downloadExcel = () => {
    if (!payee) return;
    const company = CompanyRepo.get();
    const header = ["Date", "Category", "Mode", "Notes", "Amount", "Running Total"];
    const sheetRows = rows.map((r) => [
      fmtDate(r.date),
      r.category,
      r.paymentMode === "bank" ? `Bank — ${bankNameById.get(r.bankId ?? "") ?? "unspecified"}` : fmtMode(r.paymentMode),
      r.notes ?? "",
      r.amount,
      r.running,
    ]);
    downloadXlsx(`Payee-Ledger-${payee.name}`, [
      { name: payee.name, rows: [[company.name], [`Ledger Of ${payee.name}`], [], header, ...sheetRows] },
    ]);
    toast.success("Ledger downloaded as Excel");
  };

  if (payee === undefined) return null;
  if (payee === null) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-gray-400">
        <AlertCircle className="h-12 w-12 text-gray-200" />
        <p className="font-medium">Payee not found</p>
        <button
          onClick={() => navigate({ to: "/payees" })}
          className="text-sm text-primary hover:underline"
        >
          ← Back to Payees
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#f5f6fa]">
      <div className="no-print bg-white border-b px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => navigate({ to: "/payees" })}
            className="h-8 w-8 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 flex items-center justify-center text-gray-600 transition shadow-sm"
            title="Back to Payees"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-8 w-8 shrink-0 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold text-[13px] uppercase">
            {payee.name.trim().charAt(0) || "?"}
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-gray-800 truncate leading-tight">
              {payee.name}
            </h1>
            <p className="text-[11px] text-gray-400 leading-tight">
              {payee.defaultCategory ? `Usually: ${payee.defaultCategory}` : "Expense payee"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-200 rounded-md text-xs px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <span>To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-200 rounded-md text-xs px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <button
            onClick={downloadExcel}
            className="h-8 w-8 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex items-center justify-center transition"
            title="Download as Excel"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={pdfBusy !== null}
            className="h-8 w-8 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex items-center justify-center transition disabled:opacity-50"
            title="Download as PDF"
          >
            <FileDown className="h-4 w-4" />
          </button>
          <button
            onClick={handleShare}
            disabled={pdfBusy !== null}
            className="h-8 w-8 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex items-center justify-center transition disabled:opacity-50"
            title="Share PDF"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => printWithName(pdfName())}
            className="inline-flex items-center gap-1.5 h-8 px-3 bg-primary text-white rounded-md text-sm font-semibold hover:opacity-90 transition"
            title="Print"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        <div
          ref={printRef}
          className="print-visible bg-white border rounded-lg shadow-sm max-w-4xl mx-auto"
        >
          <style>{`@media print { @page { size: A4 portrait; margin: 0; } }`}</style>
          <div className="px-5 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-bold text-gray-800">Payee Ledger — {payee.name}</p>
              <p className="text-[11px] text-gray-400">
                {CompanyRepo.get().name} · Generated {fmtDate(new Date().toISOString())} · All-time
                total paid: {fmtMoney(allTimeTotal)}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-b-lg">
            <table className="w-full text-[12px] border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-gray-50">
                  {["Date", "Category", "Mode", "Notes", "Amount", "Running Total"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200 whitespace-nowrap ${i >= 4 ? "text-right" : "text-left"}`}
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
                      No payments to {payee.name} yet
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100">
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-800 whitespace-nowrap">
                        {r.category}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        {r.paymentMode === "bank"
                          ? `Bank — ${bankNameById.get(r.bankId ?? "") ?? "unspecified"}`
                          : fmtMode(r.paymentMode)}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{r.notes ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                        {fmtMoney(r.amount)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap">
                        {fmtMoney(r.running)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                    <td colSpan={4} className="px-3 py-3 text-xs uppercase text-gray-500">
                      Total ({rows.length} payments)
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtMoney(totalPaid)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {fmtMoney(rows[rows.length - 1].running)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

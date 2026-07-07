import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { SalesRepo, CompanyRepo } from "@/repositories";
import type { Invoice, Company, PrintFormat } from "@/types";
import { fmtMoney } from "@/lib/format";
import { printWithName } from "@/lib/print";
import { downloadElementAsPdf, shareElementAsPdf } from "@/lib/pdf";
import { fmtMode } from "@/components/ModePills";
import { ThermalReceipt } from "@/components/ThermalReceipt";
import { PrintableInvoice } from "@/components/PrintableInvoice";
import { toast } from "sonner";
import {
  ArrowLeft,
  Printer,
  Check,
  AlertCircle,
  Pencil,
  FileDown,
  Share2,
  Receipt,
} from "lucide-react";

export const Route = createFileRoute("/sales/$id")({
  component: InvoiceDetailPage,
  validateSearch: (search: Record<string, unknown>): { print?: number } => ({
    print: search.print ? 1 : undefined,
  }),
});

const r2 = (n: number) => Math.round(n * 100) / 100;

const FORMATS: { value: PrintFormat; label: string }[] = [
  { value: "a4", label: "A4" },
  { value: "a4-2up", label: "2 Copies" },
  { value: "thermal80", label: "80mm" },
  { value: "thermal58", label: "58mm" },
];

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const { print } = Route.useSearch();
  const navigate = useNavigate();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [co, setCo] = useState<Company | null>(null);
  const [fmt, setFmt] = useState<PrintFormat>("a4");
  const [pdfBusy, setPdfBusy] = useState<"download" | "share" | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInv(SalesRepo.get(id) ?? null);
    const c = CompanyRepo.get();
    setCo(c);
    setFmt(c.printFormat ?? "a4");
  }, [id]);

  // Save & Print flow: arrive with ?print=1 → auto-open the print dialog
  useEffect(() => {
    if (print && inv) {
      const t = setTimeout(() => printWithName(inv.number), 500);
      return () => clearTimeout(t);
    }
  }, [print, inv]);

  const changeFormat = (f: PrintFormat) => {
    setFmt(f);
    if (co) CompanyRepo.save({ ...co, printFormat: f }); // remember for next time
  };

  const handleDownloadPdf = async () => {
    if (!inv || !printRef.current || pdfBusy) return;
    setPdfBusy("download");
    try {
      await downloadElementAsPdf(printRef.current, inv.number, fmt === "a4-2up" ? "landscape" : "portrait");
      toast.success("Invoice downloaded as PDF");
    } catch {
      toast.error("Could not generate PDF — try Print instead");
    } finally {
      setPdfBusy(null);
    }
  };

  const handleShare = async () => {
    if (!inv || !printRef.current || pdfBusy) return;
    setPdfBusy("share");
    try {
      const result = await shareElementAsPdf(
        printRef.current,
        inv.number,
        fmt === "a4-2up" ? "landscape" : "portrait",
      );
      if (result === "shared") toast.success("Invoice shared");
      else if (result === "downloaded")
        toast.info("Sharing isn't supported here — PDF downloaded instead");
    } catch {
      toast.error("Could not share invoice — try Download PDF instead");
    } finally {
      setPdfBusy(null);
    }
  };

  if (!inv) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-gray-400">
        <AlertCircle className="h-12 w-12 text-gray-200" />
        <p className="font-medium">Invoice not found</p>
        <button
          onClick={() => navigate({ to: "/sales" })}
          className="text-sm text-primary hover:underline"
        >
          ← Back to Sales
        </button>
      </div>
    );
  }

  const balance = r2(inv.total - inv.paid);
  const isPaid = balance <= 0;

  return (
    <div className="flex flex-col h-full bg-gray-100">
      <div className="no-print bg-white border-b px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate({ to: "/sales" })}
            className="h-8 w-8 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 flex items-center justify-center text-gray-600 transition shadow-sm"
            title="Back to Sales"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-10 w-10 shrink-0 rounded-lg bg-success-soft text-success flex items-center justify-center">
            <Receipt className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[17px] font-bold text-gray-800 truncate leading-tight flex items-center gap-2">
              Invoice {inv.number}
              {isPaid ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                  <Check className="h-3 w-3" /> PAID
                </span>
              ) : (
                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full shrink-0">
                  BALANCE DUE
                </span>
              )}
            </h1>
            <p className="text-[12px] text-gray-400 truncate">
              {inv.partyName} · {fmtMoney(inv.total)} · {fmtMode(inv.paymentMode)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Print format selector */}
          <div className="flex items-center rounded-md border border-gray-200 overflow-hidden h-8 shrink-0">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => changeFormat(f.value)}
                className={`h-8 px-2.5 text-xs font-semibold transition ${fmt === f.value ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate({ to: "/sales/edit/$id", params: { id: inv.id } })}
            className="inline-flex items-center gap-1.5 h-8 px-4 bg-white border border-gray-200 text-gray-700 rounded-md text-sm font-semibold hover:bg-gray-50 transition"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={pdfBusy !== null}
            className="h-8 w-8 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex items-center justify-center transition disabled:opacity-50"
            title="Download invoice as PDF"
          >
            <FileDown className="h-4 w-4" />
          </button>
          <button
            onClick={handleShare}
            disabled={pdfBusy !== null}
            className="h-8 w-8 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex items-center justify-center transition disabled:opacity-50"
            title="Share invoice PDF"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => printWithName(inv.number)}
            className="inline-flex items-center gap-1.5 h-8 px-4 bg-primary text-white rounded-md text-sm font-semibold hover:opacity-90 transition"
            title="Print"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto py-6 px-4 flex justify-center bg-gray-100">
        {(fmt === "thermal80" || fmt === "thermal58") && co ? (
          <div ref={printRef} className="bg-white shadow-lg p-5 h-fit rounded-sm">
            <ThermalReceipt inv={inv} company={co} width={fmt === "thermal80" ? 80 : 58} />
          </div>
        ) : fmt === "a4-2up" && co ? (
          <div
            ref={printRef}
            className="print-visible a4-2up-sheet bg-white w-full max-w-[1120px] shadow-lg print:shadow-none print:m-0 p-6"
            style={{ minHeight: "793px" }}
          >
            {/* Landscape A4 is only 210mm tall — a full invoice at a scale
                that "looks" like it fits can still overflow onto a second
                page once real margins are counted. Scale is deliberately
                conservative (with reclaimed print margin) so a normal-length
                bill fits on one page instead of silently spilling over. */}
            <style>{`@media print {
              @page { size: A4 landscape; margin: 0; }
              .a4-2up-sheet { padding: 6mm !important; }
            }`}</style>
            <div className="flex">
              <div className="flex-1 pr-3">
                <PrintableInvoice inv={inv} company={co} mode="sale" className="" scale={0.62} />
              </div>
              <div className="shrink-0" style={{ borderLeft: "1px dashed #999", margin: "0 4px" }} />
              <div className="flex-1 pl-3">
                <PrintableInvoice inv={inv} company={co} mode="sale" className="" scale={0.62} />
              </div>
            </div>
          </div>
        ) : (
          co && (
            <div
              ref={printRef}
              id="print-invoice"
              className="bg-white w-full max-w-[794px] shadow-lg print:shadow-none print:m-0 p-6"
              style={{ minHeight: "1123px" }}
            >
              <PrintableInvoice inv={inv} company={co} mode="sale" className="print-visible" />
            </div>
          )
        )}
      </div>
    </div>
  );
}

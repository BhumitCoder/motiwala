import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PurchaseRepo, CompanyRepo } from "@/repositories";
import type { Invoice, Company } from "@/types";
import { fmtMoney } from "@/lib/format";
import { printWithName } from "@/lib/print";
import { downloadElementAsPdf, shareElementAsPdf } from "@/lib/pdf";
import { fmtMode } from "@/components/ModePills";
import { PrintableInvoice } from "@/components/PrintableInvoice";
import { toast } from "sonner";
import {
  ArrowLeft,
  Printer,
  Check,
  AlertCircle,
  Pencil,
  FileText,
  FileDown,
  Share2,
} from "lucide-react";

export const Route = createFileRoute("/purchase/$id")({
  component: BillDetailPage,
  validateSearch: (search: Record<string, unknown>): { print?: number } => ({
    print: search.print ? 1 : undefined,
  }),
});

const r2 = (n: number) => Math.round(n * 100) / 100;

function BillDetailPage() {
  const { id } = Route.useParams();
  const { print } = Route.useSearch();
  const navigate = useNavigate();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [co, setCo] = useState<Company | null>(null);
  const [pdfBusy, setPdfBusy] = useState<"download" | "share" | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInv(PurchaseRepo.get(id) ?? null);
    setCo(CompanyRepo.get());
  }, [id]);

  // Save & Print flow: arrive with ?print=1 → auto-open the print dialog
  useEffect(() => {
    if (print && inv) {
      const t = setTimeout(() => printWithName(inv.number), 500);
      return () => clearTimeout(t);
    }
  }, [print, inv]);

  const handleDownloadPdf = async () => {
    if (!inv || !printRef.current || pdfBusy) return;
    setPdfBusy("download");
    try {
      await downloadElementAsPdf(printRef.current, inv.number, "portrait");
      toast.success("Bill downloaded as PDF");
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
      const result = await shareElementAsPdf(printRef.current, inv.number, "portrait");
      if (result === "shared") toast.success("Bill shared");
      else if (result === "downloaded")
        toast.info("Sharing isn't supported here — PDF downloaded instead");
    } catch {
      toast.error("Could not share bill — try Download PDF instead");
    } finally {
      setPdfBusy(null);
    }
  };

  if (!inv) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-gray-400">
        <AlertCircle className="h-12 w-12 text-gray-200" />
        <p className="font-medium">Bill not found</p>
        <button
          onClick={() => navigate({ to: "/purchase" })}
          className="text-sm text-primary hover:underline"
        >
          ← Back to Purchase
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
            onClick={() => navigate({ to: "/purchase" })}
            className="h-8 w-8 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 flex items-center justify-center text-gray-600 transition shadow-sm"
            title="Back to Purchase"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-10 w-10 shrink-0 rounded-lg bg-warning-soft text-warning flex items-center justify-center">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[17px] font-bold text-gray-800 truncate leading-tight flex items-center gap-2">
              Bill {inv.number}
              {isPaid ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                  <Check className="h-3 w-3" /> PAID
                </span>
              ) : (
                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full shrink-0">
                  PAYABLE
                </span>
              )}
            </h1>
            <p className="text-[12px] text-gray-400 truncate">
              {inv.partyName} · {fmtMoney(inv.total)} · {fmtMode(inv.paymentMode)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate({ to: "/purchase/edit/$id", params: { id: inv.id } })}
            className="inline-flex items-center gap-1.5 h-8 px-4 bg-white border border-gray-200 text-gray-700 rounded-md text-sm font-semibold hover:bg-gray-50 transition"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={pdfBusy !== null}
            className="h-8 w-8 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex items-center justify-center transition disabled:opacity-50"
            title="Download bill as PDF"
          >
            <FileDown className="h-4 w-4" />
          </button>
          <button
            onClick={handleShare}
            disabled={pdfBusy !== null}
            className="h-8 w-8 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex items-center justify-center transition disabled:opacity-50"
            title="Share bill PDF"
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
        {co && (
          <div
            ref={printRef}
            className="bg-white w-full max-w-[794px] shadow-lg print:shadow-none print:m-0 p-6"
            style={{ minHeight: "1123px" }}
          >
            <PrintableInvoice inv={inv} company={co} mode="purchase" className="print-visible" />
          </div>
        )}
      </div>
    </div>
  );
}

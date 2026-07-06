import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SalesRepo, CompanyRepo } from "@/repositories";
import type { Invoice, Company, PrintFormat } from "@/types";
import { fmtMoney } from "@/lib/format";
import { waLink, billMessage } from "@/lib/whatsapp";
import { printWithName } from "@/lib/print";
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
  MessageCircle,
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

  const shareWhatsApp = () => {
    if (!inv || !co) return;
    const link = waLink(inv.partyPhone, billMessage(inv, co));
    if (!link) {
      toast.error("No phone number saved for this customer");
      return;
    }
    window.open(link, "_blank");
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
            onClick={shareWhatsApp}
            className="inline-flex items-center gap-1.5 h-8 px-4 bg-emerald-600 text-white rounded-md text-sm font-semibold hover:bg-emerald-700 transition"
            title={
              inv.partyPhone
                ? `Send bill to ${inv.partyPhone}`
                : "No phone number saved for this customer"
            }
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
          <button
            onClick={() => printWithName(inv.number)}
            className="inline-flex items-center gap-1.5 h-8 px-4 bg-primary text-white rounded-md text-sm font-semibold hover:opacity-90 transition"
            title="Print, or choose 'Save as PDF' in the print dialog"
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto py-6 px-4 flex justify-center bg-gray-100">
        {(fmt === "thermal80" || fmt === "thermal58") && co ? (
          <div className="bg-white shadow-lg p-5 h-fit rounded-sm">
            <ThermalReceipt inv={inv} company={co} width={fmt === "thermal80" ? 80 : 58} />
          </div>
        ) : fmt === "a4-2up" && co ? (
          <div
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

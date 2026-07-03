import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PurchaseRepo, CompanyRepo } from "@/repositories";
import type { Invoice, Company } from "@/types";
import { fmtMoney, fmtDate } from "@/lib/format";
import { printWithName } from "@/lib/print";
import { fmtMode } from "@/components/ModePills";
import { ArrowLeft, Printer, Check, AlertCircle, Pencil } from "lucide-react";

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
  const hasDiscount = inv.lineItems.some((l) => l.discountPct > 0);

  const gstBreakdown = new Map<number, { taxable: number; cgst: number; sgst: number }>();
  if (inv.gstEnabled) {
    inv.lineItems.forEach((l) => {
      const taxable = r2(l.qty * l.price * (1 - l.discountPct / 100));
      const fullTax = r2((taxable * l.gstRate) / 100);
      const half = r2(fullTax / 2);
      const cur = gstBreakdown.get(l.gstRate) ?? { taxable: 0, cgst: 0, sgst: 0 };
      gstBreakdown.set(l.gstRate, {
        taxable: r2(cur.taxable + taxable),
        cgst: r2(cur.cgst + half),
        sgst: r2(cur.sgst + half),
      });
    });
  }

  return (
    <div className="flex flex-col h-full bg-gray-100">
      <div className="no-print bg-white border-b px-5 py-3 flex items-center justify-between gap-3">
        <button
          onClick={() => navigate({ to: "/purchase" })}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Purchase
        </button>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-[11px] text-gray-400">Bill</p>
            <p className="text-sm font-bold font-mono">{inv.number}</p>
          </div>
          <div className="text-center">
            <p className="text-[11px] text-gray-400">Supplier</p>
            <p className="text-sm font-bold">{inv.partyName}</p>
          </div>
          <div className="text-center">
            <p className="text-[11px] text-gray-400">Total</p>
            <p className="text-sm font-bold text-gray-800">{fmtMoney(inv.total)}</p>
          </div>
          <button
            onClick={() => navigate({ to: "/purchase/edit/$id", params: { id: inv.id } })}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-md text-sm font-semibold hover:bg-gray-50 transition"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
          <button
            onClick={() => printWithName(inv.number)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:opacity-90 transition"
            title="Print, or choose 'Save as PDF' in the print dialog"
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto py-6 px-4 flex justify-center bg-gray-100">
        <div
          className="print-visible bg-white w-full max-w-[794px] shadow-lg print:shadow-none print:m-0 print:p-8"
          style={{ minHeight: "1123px", padding: "40px" }}
        >
          <div className="flex items-start justify-between mb-8 pb-5 border-b-2 border-primary">
            <div>
              <h1
                className="text-[26px] font-extrabold tracking-tight"
                style={{ color: "oklch(0.55 0.22 27)" }}
              >
                {co?.name || "My Company"}
              </h1>
              {co?.email && <p className="text-xs text-gray-500 mt-0.5">{co.email}</p>}
              {co?.phone && <p className="text-xs text-gray-500">📞 {co.phone}</p>}
              {co?.gstin && (
                <p className="text-xs font-mono font-semibold text-gray-600 mt-1">
                  GSTIN: {co.gstin}
                </p>
              )}
              {co?.address && (
                <p className="text-xs text-gray-400 mt-1 max-w-[220px] leading-relaxed">
                  {co.address}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 mb-2">
                Purchase Bill
              </p>
              <p className="text-[22px] font-bold font-mono text-gray-800">{inv.number}</p>
              <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                <p>
                  <span className="text-gray-400">Date: </span>
                  <span className="font-medium">{fmtDate(inv.date)}</span>
                </p>
                <p>
                  <span className="text-gray-400">Payment: </span>
                  <span className="font-medium">{fmtMode(inv.paymentMode)}</span>
                </p>
              </div>
              {isPaid ? (
                <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  <Check className="h-3 w-3" /> PAID
                </div>
              ) : (
                <div className="mt-3 inline-block text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
                  PAYABLE
                </div>
              )}
            </div>
          </div>

          <div className="mb-7 bg-gray-50 rounded-lg p-4 border border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 mb-1.5">
              Supplier / Vendor
            </p>
            <p className="text-[15px] font-bold text-gray-800">{inv.partyName}</p>
            {inv.partyPhone && <p className="text-xs text-gray-500 mt-0.5">📞 {inv.partyPhone}</p>}
          </div>

          <table className="w-full text-[12px] mb-7" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "oklch(0.96 0.01 27)" }}>
                <Th w="32px">#</Th>
                <Th left>Item / Description</Th>
                <Th w="52px">Qty</Th>
                <Th w="44px" left>
                  Unit
                </Th>
                <Th w="90px">Rate</Th>
                {hasDiscount && <Th w="56px">Disc%</Th>}
                {inv.gstEnabled && <Th w="52px">GST%</Th>}
                <Th w="100px">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {inv.lineItems.map((l, idx) => (
                <tr key={l.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <Td center>{idx + 1}</Td>
                  <Td left>{l.name}</Td>
                  <Td>{l.qty}</Td>
                  <Td left>{l.unit}</Td>
                  <Td>{fmtMoney(l.price)}</Td>
                  {hasDiscount && <Td>{l.discountPct ? `${l.discountPct}%` : "—"}</Td>}
                  {inv.gstEnabled && <Td>{l.gstRate}%</Td>}
                  <Td bold>{fmtMoney(l.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals — subtotal after item discounts so the column adds up to the total */}
          <div className="flex justify-end mb-7">
            <div className="w-[280px]">
              <TRow
                label="Subtotal"
                value={fmtMoney(
                  r2(
                    inv.lineItems.reduce(
                      (s, l) => s + l.qty * l.price * (1 - l.discountPct / 100),
                      0,
                    ),
                  ),
                )}
              />
              {inv.discount > 0 && (
                <TRow label="Discount" value={`−${fmtMoney(inv.discount)}`} cls="text-rose-600" />
              )}
              {inv.gstEnabled &&
                Array.from(gstBreakdown).map(([rate, v]) => (
                  <div key={rate}>
                    <TRow label={`CGST @ ${rate / 2}%`} value={fmtMoney(v.cgst)} />
                    <TRow label={`SGST @ ${rate / 2}%`} value={fmtMoney(v.sgst)} />
                  </div>
                ))}
              {!!inv.roundOff && Math.abs(inv.roundOff) > 0.001 && (
                <TRow
                  label="Round Off"
                  value={`${inv.roundOff > 0 ? "+" : "−"}${fmtMoney(Math.abs(inv.roundOff))}`}
                />
              )}
              <div className="flex justify-between pt-2 mt-1 border-t-2 border-gray-800 text-[15px] font-bold">
                <span>Grand Total</span>
                <span className="tabular-nums">{fmtMoney(inv.total)}</span>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                <TRow
                  label="Paid"
                  value={fmtMoney(inv.paid)}
                  cls="text-emerald-600 font-semibold"
                />
                {balance > 0.01 && (
                  <TRow
                    label="Balance Payable"
                    value={fmtMoney(balance)}
                    cls="text-rose-600 font-bold text-[13px]"
                  />
                )}
              </div>
            </div>
          </div>

          {inv.notes && (
            <div className="border-t pt-4 mt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                Notes
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">{inv.notes}</p>
            </div>
          )}

          <div className="mt-12 pt-4 border-t border-dashed border-gray-200 text-center">
            <p className="text-[10px] text-gray-300 tracking-wide">
              Computer-generated document · {co?.name}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Th({
  children,
  w,
  left,
  center,
}: {
  children: React.ReactNode;
  w?: string;
  left?: boolean;
  center?: boolean;
}) {
  return (
    <th
      style={{
        width: w,
        textAlign: center ? "center" : left ? "left" : "right",
        padding: "8px 10px",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#6b7280",
        borderBottom: "2px solid #e5e7eb",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  left,
  center,
  bold,
}: {
  children: React.ReactNode;
  left?: boolean;
  center?: boolean;
  bold?: boolean;
}) {
  return (
    <td
      style={{
        textAlign: center ? "center" : left ? "left" : "right",
        padding: "7px 10px",
        fontWeight: bold ? 600 : 400,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </td>
  );
}

function TRow({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div className={`flex justify-between text-[12px] text-gray-700 py-0.5 ${cls}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

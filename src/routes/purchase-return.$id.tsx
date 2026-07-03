import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PurchaseReturnRepo, CompanyRepo } from "@/repositories";
import type { Return, Company } from "@/types";
import { fmtMoney, fmtDate } from "@/lib/format";
import { ArrowLeft, Printer, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/purchase-return/$id")({
  component: PurchaseReturnDetailPage,
});

const r2 = (n: number) => Math.round(n * 100) / 100;

function PurchaseReturnDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [ret, setRet] = useState<Return | null>(null);
  const [co, setCo] = useState<Company | null>(null);

  useEffect(() => {
    setRet(PurchaseReturnRepo.get(id) ?? null);
    setCo(CompanyRepo.get());
  }, [id]);

  if (!ret) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-gray-400">
        <AlertCircle className="h-12 w-12 text-gray-200" />
        <p className="font-medium">Debit note not found</p>
        <button
          onClick={() => navigate({ to: "/purchase-return" })}
          className="text-sm text-primary hover:underline"
        >
          ← Back to Purchase Returns
        </button>
      </div>
    );
  }

  const gstBreakdown = new Map<number, { taxable: number; cgst: number; sgst: number }>();
  if (ret.gstEnabled) {
    ret.lineItems.forEach((l) => {
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
          onClick={() => navigate({ to: "/purchase-return" })}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Purchase Returns
        </button>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-[11px] text-gray-400">Debit Note</p>
            <p className="text-sm font-bold font-mono">{ret.number}</p>
          </div>
          <div className="text-center">
            <p className="text-[11px] text-gray-400">Supplier</p>
            <p className="text-sm font-bold">{ret.partyName}</p>
          </div>
          <div className="text-center">
            <p className="text-[11px] text-gray-400">Total</p>
            <p className="text-sm font-bold text-gray-800">{fmtMoney(ret.total)}</p>
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:opacity-90 transition"
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto py-6 px-4 flex justify-center bg-gray-100">
        <div
          className="bg-white w-full max-w-[794px] shadow-lg print:shadow-none print:m-0"
          style={{ minHeight: "1123px", padding: "40px" }}
        >
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-[28px] font-bold text-gray-800 tracking-tight">
                {co?.name || "Company"}
              </h1>
              {co?.gstin && <p className="text-xs text-gray-500 mt-0.5">GSTIN: {co.gstin}</p>}
              {co?.phone && <p className="text-xs text-gray-500">Phone: {co.phone}</p>}
              {co?.address && <p className="text-xs text-gray-500 max-w-[260px]">{co.address}</p>}
            </div>
            <div className="text-right">
              <div className="inline-block bg-blue-50 border-2 border-blue-300 rounded-lg px-5 py-3">
                <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider mb-1">
                  Debit Note
                </p>
                <p className="text-[22px] font-extrabold text-gray-800 font-mono">{ret.number}</p>
              </div>
              <div className="mt-2 text-right text-xs text-gray-500 space-y-0.5">
                <p>
                  Date: <span className="font-semibold text-gray-700">{fmtDate(ret.date)}</span>
                </p>
                {ret.originalRef && (
                  <p>
                    Against:{" "}
                    <span className="font-semibold text-gray-700 font-mono">{ret.originalRef}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="border-t-2 border-b border-gray-200 py-4 mb-6">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Return To (Supplier)
            </p>
            <p className="text-[16px] font-bold text-gray-800">{ret.partyName}</p>
            {ret.partyPhone && <p className="text-xs text-gray-500">📞 {ret.partyPhone}</p>}
          </div>

          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="bg-gray-50 border-y border-gray-200">
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  #
                </th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Item
                </th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Qty
                </th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Unit
                </th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Price
                </th>
                {ret.lineItems.some((l) => l.discountPct > 0) && (
                  <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Disc%
                  </th>
                )}
                {ret.gstEnabled && (
                  <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    GST%
                  </th>
                )}
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {ret.lineItems.map((l, i) => (
                <tr key={l.id} className="border-b border-gray-100">
                  <td className="px-3 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium text-gray-800">{l.name}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{l.qty}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">{l.unit}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(l.price)}</td>
                  {ret.lineItems.some((x) => x.discountPct > 0) && (
                    <td className="px-3 py-2.5 text-right text-gray-500">
                      {l.discountPct > 0 ? `${l.discountPct}%` : "—"}
                    </td>
                  )}
                  {ret.gstEnabled && (
                    <td className="px-3 py-2.5 text-right text-gray-500">{l.gstRate}%</td>
                  )}
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {fmtMoney(l.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mb-6">
            <div className="w-72 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="tabular-nums">{fmtMoney(r2(ret.lineItems.reduce((s, l) => s + l.qty * l.price * (1 - l.discountPct / 100), 0)))}</span>
              </div>
              {ret.gstEnabled && gstBreakdown.size > 0 && (
                <>
                  {Array.from(gstBreakdown.entries()).map(([rate, v]) => (
                    <div key={rate} className="text-xs text-gray-400 space-y-0.5">
                      <div className="flex justify-between">
                        <span>CGST ({rate / 2}%)</span>
                        <span className="tabular-nums">{fmtMoney(v.cgst)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>SGST ({rate / 2}%)</span>
                        <span className="tabular-nums">{fmtMoney(v.sgst)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total GST</span>
                    <span className="tabular-nums">{fmtMoney(ret.taxAmount)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center pt-2 mt-1 border-t-2 border-gray-800 font-bold text-[18px]">
                <span>Debit Note Total</span>
                <span className="tabular-nums text-blue-600">{fmtMoney(ret.total)}</span>
              </div>
            </div>
          </div>

          {ret.notes && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Notes / Reason
              </p>
              <p className="text-sm text-gray-600">{ret.notes}</p>
            </div>
          )}

          <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between text-xs text-gray-400">
            <span>This is a computer-generated debit note.</span>
            <span>{co?.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

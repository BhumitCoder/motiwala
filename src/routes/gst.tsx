import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useEffect, useState } from "react";
import { SalesRepo, PurchaseRepo } from "@/repositories";
import { fmtMoney } from "@/lib/format";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/gst")({ component: GstPage });

function GstPage() {
  const [gstr1, setGstr1] = useState<{ rate: number; taxable: number; tax: number }[]>([]);
  const [gstr2, setGstr2] = useState<{ rate: number; taxable: number; tax: number }[]>([]);

  useEffect(() => {
    const agg = (all: any[]) => {
      // Only GST bills belong in GST returns
      const invoices = all.filter((inv) => inv.gstEnabled !== false);
      const map = new Map<number, { taxable: number; tax: number }>();
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
          const cur = map.get(gstRate) ?? { taxable: 0, tax: 0 };
          map.set(gstRate, { taxable: cur.taxable + taxable, tax: cur.tax + tax });
        }),
      );
      return Array.from(map, ([rate, v]) => ({ rate, ...v })).sort((a, b) => a.rate - b.rate);
    };
    setGstr1(agg(SalesRepo.all()));
    setGstr2(agg(PurchaseRepo.all()));
  }, []);

  const outTotal = gstr1.reduce((s, r) => s + r.tax, 0);
  const inTotal = gstr2.reduce((s, r) => s + r.tax, 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="GST"
        subtitle={`Output: ${fmtMoney(outTotal)} · Input: ${fmtMoney(inTotal)} · Payable: ${fmtMoney(outTotal - inTotal)}`}
        icon={<FileText className="h-5 w-5" />}
      />
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-auto">
        <Section title="GSTR-1 (Sales / Outward)" rows={gstr1} />
        <Section title="GSTR-2 (Purchase / Inward)" rows={gstr2} />
      </div>
    </div>
  );
}

function Section({
  title,
  rows,
}: {
  title: string;
  rows: { rate: number; taxable: number; tax: number }[];
}) {
  const total = rows.reduce((s, r) => s + r.tax, 0);
  return (
    <div className="border rounded-md bg-card">
      <div className="px-3 py-2 border-b font-semibold">{title}</div>
      <div className="data-table">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th>GST Rate</th>
              <th style={{ textAlign: "right" }}>Taxable Value</th>
              <th style={{ textAlign: "right" }}>Tax Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center py-6 text-muted-foreground">
                  No entries
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.rate}>
                  <td>{r.rate}%</td>
                  <td className="text-right">{fmtMoney(r.taxable)}</td>
                  <td className="text-right">{fmtMoney(r.tax)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t p-2 flex justify-between font-semibold text-sm">
        <span>Total Tax</span>
        <span>{fmtMoney(total)}</span>
      </div>
    </div>
  );
}

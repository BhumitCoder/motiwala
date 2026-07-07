import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PurchaseReturnRepo, ItemRepo } from "@/repositories";
import type { Return } from "@/types";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Plus, CornerUpLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/purchase-return/")({ component: PurchaseReturnPage });

function PurchaseReturnPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Return[]>([]);
  const refresh = () =>
    setRows(PurchaseReturnRepo.all().sort((a, b) => b.date.localeCompare(a.date)));
  useEffect(refresh, []);

  const totalDebit = rows.reduce((s, r) => s + r.total, 0);

  const handleDelete = (r: Return) => {
    if (!confirm(`Delete return ${r.number}? Returned quantities will be added back to stock.`))
      return;
    // Reverse the stock deduction this purchase return made
    for (const l of r.lineItems) {
      const it = ItemRepo.get(l.itemId);
      if (it) ItemRepo.adjustField(it.id, "stock", l.qty);
    }
    PurchaseReturnRepo.remove(r.id);
    refresh();
    toast.success("Purchase return deleted — stock adjusted");
  };

  return (
    <div className="flex flex-col h-full bg-[#f5f6fa]">
      <PageHeader
        title="Purchase Returns"
        subtitle={`${rows.length} debit notes · Total: ${fmtMoney(totalDebit)}`}
        icon={<CornerUpLeft className="h-5 w-5" />}
        actions={
          <button
            onClick={() => navigate({ to: "/purchase-return/new" })}
            className="inline-flex items-center gap-1.5 h-8 px-4 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:opacity-90 transition"
          >
            <Plus className="h-4 w-4" /> New Purchase Return
          </button>
        }
      />

      <div className="p-6 flex-1 min-h-0 flex">
        <DataTable
          activateOnClick
          columns={[
            {
              key: "number",
              label: "Debit Note #",
              render: (r) => <span className="font-mono">{r.number}</span>,
              sortValue: (r) => r.number,
            },
            { key: "date", label: "Date", render: (r) => fmtDate(r.date), sortValue: (r) => r.date },
            {
              key: "original",
              label: "Original Bill #",
              render: (r) => <span className="font-mono">{r.originalRef || "—"}</span>,
            },
            {
              key: "supplier",
              label: "Supplier",
              render: (r) => <span className="max-w-[160px] truncate block">{r.partyName}</span>,
              sortValue: (r) => r.partyName,
            },
            {
              key: "items",
              label: "Items",
              align: "right",
              render: (r) => r.lineItems.length,
              sortValue: (r) => r.lineItems.length,
            },
            { key: "gst", label: "GST", align: "right", render: (r) => (r.gstEnabled ? "Yes" : "No") },
            {
              key: "total",
              label: "Total",
              align: "right",
              render: (r) => <span className="tabular-nums">{fmtMoney(r.total)}</span>,
              sortValue: (r) => r.total,
            },
            {
              key: "action",
              label: "Action",
              align: "center",
              render: (r) => (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(r);
                  }}
                  className="p-1 rounded hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition"
                  title="Delete return"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ),
            },
          ]}
          rows={rows}
          rowKey={(r) => r.id}
          onRowActivate={(r) => navigate({ to: "/purchase-return/$id", params: { id: r.id } })}
          emptyMessage='No purchase returns yet — click "New Purchase Return" to create a debit note'
          footer={
            <tr>
              <td colSpan={6}>Total ({rows.length} returns)</td>
              <td className="text-right tabular-nums">{fmtMoney(totalDebit)}</td>
              <td />
            </tr>
          }
        />
      </div>
    </div>
  );
}

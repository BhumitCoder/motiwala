import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ItemRepo,
  SalesRepo,
  PurchaseRepo,
  SaleReturnRepo,
  PurchaseReturnRepo,
  StockAdjustmentRepo,
} from "@/repositories";
import { fmtMoney, fmtDate } from "@/lib/format";
import { usePagination, PaginationBar } from "@/components/Pagination";
import { ItemDialog, StockAdjustDialog } from "./items";
import type { Item, Invoice, Return } from "@/types";
import { ArrowLeft, Package, Pencil, ArrowUpDown, AlertCircle, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/items_/$id")({ component: ItemDetailPage });

const r2 = (n: number) => Math.round(n * 100) / 100;

interface HistoryRow {
  date: string;
  created: string;
  type: string;
  ref: string;
  party: string;
  qtyIn: number;
  qtyOut: number;
  rate: number | null;
}

function ItemDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [editOpen, setEditOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setItem(ItemRepo.get(id) ?? null);
  }, [id, refreshKey]);

  const { rows, soldQty, boughtQty, profit } = useMemo(() => {
    const entries: HistoryRow[] = [];
    let soldQty = 0;
    let boughtQty = 0;
    let profit = 0;
    if (!item) return { rows: entries, soldQty, boughtQty, profit };
    const costOf = (l: { costPrice?: number }) => l.costPrice ?? item.purchasePrice ?? 0;

    const collect = (
      docs: (Invoice | Return)[],
      type: string,
      inward: boolean,
      onQty?: (l: { qty: number; price: number; discountPct: number; costPrice?: number }) => void,
    ) => {
      for (const d of docs) {
        for (const l of d.lineItems) {
          if (l.itemId !== id) continue;
          entries.push({
            date: d.date,
            created: d.createdAt,
            type,
            ref: d.number,
            party: d.partyName,
            qtyIn: inward ? l.qty : 0,
            qtyOut: inward ? 0 : l.qty,
            rate: l.price,
          });
          onQty?.(l);
        }
      }
    };

    collect(SalesRepo.all(), "Sale", false, (l) => {
      soldQty = r2(soldQty + l.qty);
      profit = r2(profit + l.qty * l.price * (1 - l.discountPct / 100) - l.qty * costOf(l));
    });
    collect(PurchaseRepo.all(), "Purchase", true, (l) => {
      boughtQty = r2(boughtQty + l.qty);
    });
    collect(SaleReturnRepo.all(), "Sale Return", true, (l) => {
      soldQty = r2(soldQty - l.qty);
      profit = r2(profit - (l.qty * l.price * (1 - l.discountPct / 100) - l.qty * costOf(l)));
    });
    collect(PurchaseReturnRepo.all(), "Purchase Return", false, (l) => {
      boughtQty = r2(boughtQty - l.qty);
    });
    for (const a of StockAdjustmentRepo.all()) {
      if (a.itemId !== id) continue;
      entries.push({
        date: a.date,
        created: a.createdAt,
        type: a.type === "add" ? "Stock Added" : "Stock Reduced",
        ref: a.reason || "Adjustment",
        party: "—",
        qtyIn: a.type === "add" ? a.qty : 0,
        qtyOut: a.type === "reduce" ? a.qty : 0,
        rate: null,
      });
    }
    entries.sort(
      (a, b) => b.date.localeCompare(a.date) || (b.created ?? "").localeCompare(a.created ?? ""),
    );
    return { rows: entries, soldQty, boughtQty, profit };
  }, [item, id, refreshKey]);

  const pg = usePagination(rows);

  if (item === undefined) return null;
  if (item === null) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-gray-400">
        <AlertCircle className="h-12 w-12 text-gray-200" />
        <p className="font-medium">Item not found</p>
        <button
          onClick={() => navigate({ to: "/items" })}
          className="text-sm text-primary hover:underline"
        >
          ← Back to Items
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#f5f6fa]">
      {/* Header */}
      <div className="bg-white border-b px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate({ to: "/items" })}
            className="h-9 w-9 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 flex items-center justify-center text-gray-600 transition shadow-sm"
            title="Back to Items"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-10 w-10 shrink-0 rounded-lg bg-primary-soft text-primary flex items-center justify-center">
            <Package className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[17px] font-bold text-gray-800 truncate leading-tight">
              {item.name}
            </h1>
            <p className="text-[12px] text-gray-400">
              {item.category || "No category"} · Unit: {item.unit} · Item History
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAdjustOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-md text-sm font-semibold hover:bg-gray-50 transition"
          >
            <ArrowUpDown className="h-4 w-4" /> Adjust Stock
          </button>
          <button
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:opacity-90 transition"
          >
            <Pencil className="h-4 w-4" /> Edit Item
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 lg:grid-cols-6 bg-white border-b">
        <Stat
          label="Current Stock"
          value={`${item.stock} ${item.unit}`}
          color={item.stock < 0 ? "text-rose-600" : "text-gray-800"}
        />
        <Stat label="Stock Value" value={fmtMoney(r2(item.stock * item.purchasePrice))} />
        <Stat label="Purchase Price" value={fmtMoney(item.purchasePrice)} />
        <Stat label="Sale Price" value={fmtMoney(item.salePrice)} />
        <Stat label="Total Sold" value={`${soldQty} ${item.unit}`} />
        <Stat
          label="Profit Earned"
          value={fmtMoney(profit)}
          color={profit >= 0 ? "text-emerald-600" : "text-rose-600"}
          icon
        />
      </div>

      {/* History */}
      <div className="flex-1 overflow-auto p-5">
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden max-w-5xl mx-auto flex flex-col">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <p className="text-sm font-bold text-gray-800">Transaction History</p>
            <p className="text-[11px] text-gray-400">
              Opening stock: {item.openingStock} {item.unit} · Purchased: {boughtQty} · Sold:{" "}
              {soldQty}
            </p>
          </div>
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {["Date", "Type", "Ref #", "Party", "Rate", "Qty In", "Qty Out"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200 whitespace-nowrap ${i >= 4 ? "text-right" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-14 text-gray-400">
                    No transactions for this item yet
                  </td>
                </tr>
              ) : (
                pg.paged.map((e, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      {fmtDate(e.date)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${e.qtyIn > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}
                      >
                        {e.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-blue-600">{e.ref}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[160px] truncate">
                      {e.party}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                      {e.rate != null ? fmtMoney(e.rate) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 font-semibold">
                      {e.qtyIn ? `+${e.qtyIn}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-rose-600 font-semibold">
                      {e.qtyOut ? `−${e.qtyOut}` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <PaginationBar
            page={pg.page}
            totalPages={pg.totalPages}
            pageSize={pg.pageSize}
            total={pg.total}
            onPage={pg.setPage}
            onPageSize={pg.setPageSize}
          />
        </div>
      </div>

      <ItemDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        item={item}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
      <StockAdjustDialog
        item={adjustOpen ? item : null}
        onOpenChange={(v) => {
          if (!v) setAdjustOpen(false);
        }}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  color = "text-gray-800",
  icon,
}: {
  label: string;
  value: string;
  color?: string;
  icon?: boolean;
}) {
  return (
    <div className="px-4 py-3 border-r border-gray-100 last:border-r-0">
      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5 flex items-center gap-1">
        {icon && <TrendingUp className="h-3 w-3" />}
        {label}
      </p>
      <p className={`text-[15px] font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

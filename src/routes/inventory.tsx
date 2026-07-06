import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import {
  ItemRepo,
  SalesRepo,
  PurchaseRepo,
  SaleReturnRepo,
  PurchaseReturnRepo,
  StockAdjustmentRepo,
} from "@/repositories";
import type { Item } from "@/types";
import { fmtMoney } from "@/lib/format";
import { Boxes, Search, Wallet, AlertTriangle, type LucideIcon } from "lucide-react";

export const Route = createFileRoute("/inventory")({ component: InventoryPage });

function InventoryPage() {
  const [rows, setRows] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const refresh = () => setRows(ItemRepo.all());
  useEffect(() => {
    refresh();
    // This is a read-only page with no local mutations to trigger a refresh
    // from, but stock genuinely changes elsewhere (another device/tab
    // billing a sale) while a user stays parked here — resync when they
    // come back to this tab/window instead of showing stale figures
    // indefinitely.
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  // Stock In = purchases + sale returns + manual additions
  // Stock Out = sales + purchase returns + manual reductions
  const salesQty = new Map<string, number>();
  SalesRepo.all().forEach((s) =>
    s.lineItems.forEach((l) => salesQty.set(l.itemId, (salesQty.get(l.itemId) ?? 0) + l.qty)),
  );
  PurchaseReturnRepo.all().forEach((r) =>
    r.lineItems.forEach((l) => salesQty.set(l.itemId, (salesQty.get(l.itemId) ?? 0) + l.qty)),
  );
  const purchaseQty = new Map<string, number>();
  PurchaseRepo.all().forEach((s) =>
    s.lineItems.forEach((l) => purchaseQty.set(l.itemId, (purchaseQty.get(l.itemId) ?? 0) + l.qty)),
  );
  SaleReturnRepo.all().forEach((r) =>
    r.lineItems.forEach((l) => purchaseQty.set(l.itemId, (purchaseQty.get(l.itemId) ?? 0) + l.qty)),
  );
  StockAdjustmentRepo.all().forEach((a) => {
    const map = a.type === "add" ? purchaseQty : salesQty;
    map.set(a.itemId, (map.get(a.itemId) ?? 0) + a.qty);
  });

  const columns: Column<Item>[] = [
    {
      key: "name",
      label: "Item",
      render: (r) => <span className="font-medium">{r.name}</span>,
      sortValue: (r) => r.name,
    },
    {
      key: "sku",
      label: "SKU",
      width: "120px",
      render: (r) => <span className="font-mono text-xs">{r.sku ?? "—"}</span>,
    },
    {
      key: "opening",
      label: "Opening",
      align: "right",
      width: "90px",
      render: (r) => r.openingStock,
    },
    {
      key: "in",
      label: "Stock In",
      align: "right",
      width: "90px",
      render: (r) => <span className="text-success">+{purchaseQty.get(r.id) ?? 0}</span>,
    },
    {
      key: "out",
      label: "Stock Out",
      align: "right",
      width: "90px",
      render: (r) => <span className="text-warning">-{salesQty.get(r.id) ?? 0}</span>,
    },
    {
      key: "stock",
      label: "Current",
      align: "right",
      width: "100px",
      render: (r) => {
        // minStock=0 is a valid "alert exactly at zero" threshold (must not
        // be treated as unset), and negative/oversold stock should always
        // stand out even when no threshold is configured at all.
        const low = (r.minStock != null && r.stock <= r.minStock) || r.stock < 0;
        return (
          <span className={`font-medium ${low ? "text-warning" : ""}`}>
            {r.stock} {r.unit}
          </span>
        );
      },
      sortValue: (r) => r.stock,
    },
    { key: "min", label: "Min", align: "right", width: "70px", render: (r) => r.minStock ?? "—" },
    {
      key: "value",
      label: "Stock Value",
      align: "right",
      width: "120px",
      render: (r) => fmtMoney(r.stock * r.purchasePrice),
      sortValue: (r) => r.stock * r.purchasePrice,
    },
  ];

  const totalValue = rows.reduce((s, r) => s + r.stock * r.purchasePrice, 0);
  const lowCount = rows.filter(
    (r) => (r.minStock != null && r.stock <= r.minStock) || r.stock < 0,
  ).length;

  const filtered = rows.filter((r) => {
    const s = q.toLowerCase();
    return !s || r.name.toLowerCase().includes(s) || r.sku?.toLowerCase().includes(s);
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Inventory"
        subtitle={`${rows.length} items`}
        icon={<Boxes className="h-5 w-5" />}
        actions={
          <>
            <InventoryCard icon={Wallet} label="Stock Value" value={fmtMoney(totalValue)} tone="primary" />
            <InventoryCard icon={AlertTriangle} label="Low Stock" value={String(lowCount)} tone="rose" />
            <div className="relative w-44 lg:w-56">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                placeholder="Search items by name or SKU..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full h-8 pl-8 pr-3 border border-gray-200 rounded-md text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </>
        }
      />
      <div className="p-3 flex-1 min-h-0 flex">
        <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} />
      </div>
    </div>
  );
}

const INV_TONES = {
  primary: { bg: "bg-primary-soft", text: "text-primary" },
  rose: { bg: "bg-rose-50", text: "text-rose-600" },
} as const;

function InventoryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: keyof typeof INV_TONES;
}) {
  const t = INV_TONES[tone];
  return (
    <div className="shrink-0 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border border-gray-100 bg-white">
      <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${t.bg} ${t.text}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5 whitespace-nowrap">
          {label}
        </p>
        <p className={`text-[14px] font-bold tabular-nums whitespace-nowrap ${t.text}`}>{value}</p>
      </div>
    </div>
  );
}

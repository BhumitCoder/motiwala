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

export const Route = createFileRoute("/inventory")({ component: InventoryPage });

function InventoryPage() {
  const [rows, setRows] = useState<Item[]>([]);
  useEffect(() => setRows(ItemRepo.all()), []);

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
        const low = r.minStock && r.stock <= r.minStock;
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
  const lowCount = rows.filter((r) => r.minStock && r.stock <= r.minStock).length;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Inventory"
        subtitle={`${rows.length} items · Stock value: ${fmtMoney(totalValue)} · Low: ${lowCount}`}
      />
      <div className="p-3 flex-1 min-h-0 flex">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { ItemRepo, StockAdjustmentRepo } from "@/repositories";
import type { Item } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/Field";
import { fmtMoney, today } from "@/lib/format";
import { Plus, Search, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/items")({ component: ItemsPage });

function ItemsPage() {
  const [rows, setRows] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Item | null>(null);
  const [adjustItem, setAdjustItem] = useState<Item | null>(null);
  const refresh = () => setRows(ItemRepo.all());
  useEffect(refresh, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing =
        el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
      if (!typing && e.key === "n") {
        e.preventDefault();
        setEdit(null);
        setOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const filtered = rows.filter((r) => {
    const s = q.toLowerCase();
    return (
      !s ||
      r.name.toLowerCase().includes(s) ||
      r.sku?.toLowerCase().includes(s) ||
      r.barcode?.includes(s)
    );
  });

  const columns: Column<Item>[] = [
    {
      key: "name",
      label: "Name",
      render: (r) => <span className="font-medium">{r.name}</span>,
      sortValue: (r) => r.name,
    },
    { key: "category", label: "Category", width: "140px", render: (r) => r.category ?? "—" },
    {
      key: "purchase",
      label: "Purchase Price",
      width: "130px",
      align: "right",
      render: (r) => fmtMoney(r.purchasePrice),
    },
    {
      key: "sale",
      label: "Sale Price",
      width: "130px",
      align: "right",
      render: (r) => fmtMoney(r.salePrice),
      sortValue: (r) => r.salePrice,
    },
    {
      key: "stock",
      label: "Stock",
      width: "100px",
      align: "right",
      render: (r) => {
        const low = r.minStock && r.stock <= r.minStock;
        return (
          <span className={low ? "text-warning font-medium" : ""}>
            {r.stock} {r.unit}
          </span>
        );
      },
      sortValue: (r) => r.stock,
    },
    {
      key: "adjust",
      label: "",
      width: "60px",
      align: "center",
      render: (r) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setAdjustItem(r);
          }}
          className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"
          title="Adjust stock (damage, counting correction…)"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Items"
        subtitle={`${rows.length} items`}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEdit(null);
              setOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> New Item <kbd className="text-[10px] ml-1">N</kbd>
          </Button>
        }
      />
      <div className="p-3 border-b bg-card">
        <div className="relative max-w-md">
          <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
          <input
            autoFocus
            placeholder="Search items by name..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 pl-7 pr-2 border rounded w-full bg-background focus:border-primary outline-none"
          />
        </div>
      </div>
      <div className="p-3 flex-1 min-h-0 flex">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          onRowActivate={(r) => {
            setEdit(r);
            setOpen(true);
          }}
          onDelete={(r) => {
            if (confirm(`Delete ${r.name}?`)) {
              ItemRepo.remove(r.id);
              refresh();
              toast.success("Item deleted");
            }
          }}
        />
      </div>
      <ItemDialog open={open} onOpenChange={setOpen} item={edit} onSaved={refresh} />
      <StockAdjustDialog
        item={adjustItem}
        onOpenChange={(v) => {
          if (!v) setAdjustItem(null);
        }}
        onSaved={refresh}
      />
    </div>
  );
}

function StockAdjustDialog({
  item,
  onOpenChange,
  onSaved,
}: {
  item: Item | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<"add" | "reduce">("add");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setType("add");
      setQty("");
      setDate(today());
      setReason("");
      setSaving(false);
    }
  }, [item]);

  if (!item) return null;
  const n = parseFloat(qty) || 0;
  const newStock = Math.round((item.stock + (type === "add" ? n : -n)) * 100) / 100;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (n <= 0) {
      toast.error("Enter quantity to adjust");
      return;
    }
    setSaving(true);
    ItemRepo.adjustField(item.id, "stock", type === "add" ? n : -n);
    StockAdjustmentRepo.add({
      itemId: item.id,
      itemName: item.name,
      date,
      type,
      qty: n,
      reason: reason.trim() || undefined,
    } as any);
    toast.success(
      `${item.name}: stock ${type === "add" ? "increased" : "reduced"} by ${n} → now ${newStock} ${item.unit}`,
    );
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Stock — {item.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Current stock:{" "}
            <span className="font-bold text-foreground">
              {item.stock} {item.unit}
            </span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType("add")}
              className={`flex-1 h-9 rounded-md border text-sm font-semibold transition ${type === "add" ? "bg-success-soft text-success border-success" : "bg-background text-muted-foreground"}`}
            >
              + Add Stock
            </button>
            <button
              type="button"
              onClick={() => setType("reduce")}
              className={`flex-1 h-9 rounded-md border text-sm font-semibold transition ${type === "reduce" ? "bg-destructive/10 text-destructive border-destructive" : "bg-background text-muted-foreground"}`}
            >
              − Reduce Stock
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={`Quantity (${item.unit}) *`}
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <Field
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <Field
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Damaged, counting correction, sample…"
          />
          {n > 0 && (
            <p className="text-sm">
              New stock will be:{" "}
              <span className={`font-bold ${newStock < 0 ? "text-destructive" : "text-success"}`}>
                {newStock} {item.unit}
              </span>
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Adjust Stock"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ItemDialog({
  open,
  onOpenChange,
  item,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: Item | null;
  onSaved: () => void;
}) {
  const firstRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState<Partial<Item>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setF(
        item ?? {
          unit: "pcs",
          gstRate: 0,
          purchasePrice: 0,
          salePrice: 0,
          stock: 0,
          openingStock: 0,
        },
      );
      setSaving(false);
      setTimeout(() => firstRef.current?.focus(), 50);
    }
  }, [open, item]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!f.name?.trim()) {
      toast.error("Name required");
      return;
    }
    // Repeat items cannot be added — block duplicate names (also when renaming)
    const dup = ItemRepo.all().find(
      (x) => x.name.trim().toLowerCase() === f.name!.trim().toLowerCase() && x.id !== item?.id,
    );
    if (dup) {
      toast.error(`Item "${dup.name}" already exists — repeat items cannot be added`);
      return;
    }
    setSaving(true);
    if (item) {
      // Correcting opening stock shifts current stock by the same difference
      const openingDelta = (f.openingStock ?? 0) - (item.openingStock ?? 0);
      const patch: Partial<Item> = { ...f };
      delete patch.stock; // stock only changes via atomic adjustments
      ItemRepo.update(item.id, patch);
      if (openingDelta !== 0) ItemRepo.adjustField(item.id, "stock", openingDelta);
      toast.success(
        openingDelta !== 0
          ? `Item updated — stock adjusted by ${openingDelta > 0 ? "+" : ""}${openingDelta}`
          : "Item updated",
      );
    } else {
      ItemRepo.add({
        ...f,
        name: f.name!,
        unit: f.unit ?? "pcs",
        gstRate: f.gstRate ?? 0,
        purchasePrice: f.purchasePrice ?? 0,
        salePrice: f.salePrice ?? 0,
        stock: f.openingStock ?? 0,
        openingStock: f.openingStock ?? 0,
      } as any);
      toast.success("Item created");
    }
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Item" : "New Item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field
              ref={firstRef}
              label="Name *"
              value={f.name ?? ""}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </div>
          <Field
            label="Category"
            value={f.category ?? ""}
            onChange={(e) => setF({ ...f, category: e.target.value })}
          />
          <Field
            label="Purchase Price"
            type="number"
            value={f.purchasePrice ?? 0}
            onChange={(e) => setF({ ...f, purchasePrice: parseFloat(e.target.value) || 0 })}
          />
          <Field
            label="Sale Price *"
            type="number"
            value={f.salePrice ?? 0}
            onChange={(e) => setF({ ...f, salePrice: parseFloat(e.target.value) || 0 })}
          />
          <Field
            label="Wholesale Price"
            type="number"
            value={f.wholesalePrice ?? ""}
            onChange={(e) =>
              setF({ ...f, wholesalePrice: parseFloat(e.target.value) || undefined })
            }
          />
          <Field
            label="Opening Stock"
            type="number"
            value={f.openingStock ?? 0}
            onChange={(e) => setF({ ...f, openingStock: parseFloat(e.target.value) || 0 })}
          />
          <Field
            label="Min Stock (low-stock alert)"
            type="number"
            value={f.minStock ?? ""}
            onChange={(e) => setF({ ...f, minStock: parseFloat(e.target.value) || undefined })}
          />
          <div className="col-span-3 flex justify-end gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

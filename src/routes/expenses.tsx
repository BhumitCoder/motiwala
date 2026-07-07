import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { ExpenseRepo } from "@/repositories";
import type { Expense } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/Field";
import { NumField } from "@/components/NumInput";
import { ModePills, fmtMode } from "@/components/ModePills";
import { fmtMoney, fmtDate, today } from "@/lib/format";
import { Plus, Receipt } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/expenses")({ component: ExpensesPage });

function ExpensesPage() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Expense | null>(null);
  const refresh = () => setRows(ExpenseRepo.all());
  useEffect(refresh, []);

  const total = rows.reduce((s, r) => s + r.amount, 0);

  const columns: Column<Expense>[] = [
    {
      key: "date",
      label: "Date",
      width: "120px",
      render: (r) => fmtDate(r.date),
      sortValue: (r) => r.date,
    },
    { key: "category", label: "Category", width: "180px", render: (r) => r.category },
    { key: "notes", label: "Notes", render: (r) => r.notes ?? "—" },
    {
      key: "mode",
      label: "Mode",
      width: "80px",
      render: (r) => <span className="text-xs">{fmtMode(r.paymentMode)}</span>,
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      width: "120px",
      render: (r) => fmtMoney(r.amount),
      sortValue: (r) => r.amount,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Expenses"
        subtitle={`${rows.length} entries · ${fmtMoney(total)} total`}
        icon={<Receipt className="h-5 w-5" />}
        iconClassName="text-warning"
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEdit(null);
              setOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> New Expense
          </Button>
        }
      />
      <div className="p-6 flex-1 min-h-0 flex">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          activateOnClick
          onRowActivate={(r) => {
            setEdit(r);
            setOpen(true);
          }}
          onDelete={(r) => {
            if (confirm("Delete expense?")) {
              ExpenseRepo.remove(r.id);
              refresh();
              toast.success("Deleted");
            }
          }}
        />
      </div>
      <ExpenseDialog open={open} onOpenChange={setOpen} expense={edit} onSaved={refresh} />
    </div>
  );
}

function ExpenseDialog({
  open,
  onOpenChange,
  expense,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expense: Expense | null;
  onSaved: () => void;
}) {
  const firstRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState<Partial<Expense>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setF(expense ?? { date: today(), paymentMode: "cash", amount: 0, category: "" });
      setSaving(false);
      setTimeout(() => firstRef.current?.focus(), 50);
    }
  }, [open, expense]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!f.category?.trim()) {
      toast.error("Category required");
      return;
    }
    if (!f.amount || f.amount <= 0) {
      toast.error("Amount must be positive");
      return;
    }
    setSaving(true);
    if (expense) {
      ExpenseRepo.update(expense.id, f as Expense);
      toast.success("Updated");
    } else {
      ExpenseRepo.add(f as any);
      toast.success("Saved");
    }
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? "Edit Expense" : "New Expense"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            ref={firstRef}
            label="Category *"
            value={f.category ?? ""}
            onChange={(e) => setF({ ...f, category: e.target.value })}
          />
          <Field
            label="Date"
            type="date"
            value={f.date ?? today()}
            onChange={(e) => setF({ ...f, date: e.target.value })}
          />
          <NumField
            label="Amount *"
            value={f.amount ?? 0}
            onValue={(n) => setF({ ...f, amount: n })}
          />
          <label className="flex flex-col gap-1 text-[12px]">
            <span className="text-muted-foreground font-medium">Payment Mode</span>
            <div className="flex items-center h-8">
              <ModePills
                value={f.paymentMode ?? "cash"}
                onChange={(m) => setF({ ...f, paymentMode: m })}
                modes={["cash", "upi", "bank", "cheque"]}
              />
            </div>
          </label>
          <div className="col-span-2">
            <Field
              label="Notes"
              value={f.notes ?? ""}
              onChange={(e) => setF({ ...f, notes: e.target.value })}
            />
          </div>
          <div className="col-span-2 flex justify-end gap-2 mt-2">
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

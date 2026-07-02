import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  SalesRepo,
  PurchaseRepo,
  ExpenseRepo,
  PaymentRepo,
  CashAdjustmentRepo,
} from "@/repositories";
import { cashFlows, type FlowEntry } from "@/lib/ledger";
import { fmtMoney, fmtDate, today } from "@/lib/format";
import { usePagination, PaginationBar } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/Field";
import { Banknote } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/cash")({ component: CashPage });

function CashPage() {
  const [entries, setEntries] = useState<FlowEntry[]>([]);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const refresh = () =>
    setEntries(
      cashFlows(
        SalesRepo.all(),
        PurchaseRepo.all(),
        ExpenseRepo.all(),
        PaymentRepo.all(),
        CashAdjustmentRepo.all(),
      ),
    );
  useEffect(refresh, []);

  const totalIn = entries.reduce((s, e) => s + e.in, 0);
  const totalOut = entries.reduce((s, e) => s + e.out, 0);
  const balance = totalIn - totalOut;
  const pg = usePagination(entries);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Cash in Hand"
        subtitle={`In: ${fmtMoney(totalIn)} · Out: ${fmtMoney(totalOut)} · Balance: ${fmtMoney(balance)}`}
        actions={
          <Button size="sm" onClick={() => setAdjustOpen(true)}>
            <Banknote className="h-3.5 w-3.5" /> Adjust Cash
          </Button>
        }
      />
      <div className="p-3 flex-1 min-h-0 flex flex-col">
        <div className="border rounded-md bg-card flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto data-table">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th style={{ textAlign: "right" }}>Cash In</th>
                  <th style={{ textAlign: "right" }}>Cash Out</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      No cash transactions yet.
                    </td>
                  </tr>
                ) : (
                  pg.paged.map((e, i) => (
                    <tr key={i}>
                      <td>{fmtDate(e.date)}</td>
                      <td>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{e.type}</span>
                      </td>
                      <td>{e.ref}</td>
                      <td className="text-right text-success">{e.in ? fmtMoney(e.in) : "—"}</td>
                      <td className="text-right text-warning">{e.out ? fmtMoney(e.out) : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
      <CashAdjustDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        onSaved={refresh}
        currentBalance={balance}
      />
    </div>
  );
}

function CashAdjustDialog({
  open,
  onOpenChange,
  onSaved,
  currentBalance,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  currentBalance: number;
}) {
  const [type, setType] = useState<"add" | "reduce">("add");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType("add");
      setAmount("");
      setDate(today());
      setReason("");
      setSaving(false);
    }
  }, [open]);

  const n = parseFloat(amount) || 0;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (n <= 0) {
      toast.error("Enter amount to adjust");
      return;
    }
    setSaving(true);
    CashAdjustmentRepo.add({ date, type, amount: n, reason: reason.trim() || undefined } as any);
    toast.success(`Cash ${type === "add" ? "added" : "reduced"}: ${fmtMoney(n)}`);
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Cash in Hand</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Current balance:{" "}
            <span className="font-bold text-foreground">{fmtMoney(currentBalance)}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType("add")}
              className={`flex-1 h-9 rounded-md border text-sm font-semibold transition ${type === "add" ? "bg-success-soft text-success border-success" : "bg-background text-muted-foreground"}`}
            >
              + Add Cash
            </button>
            <button
              type="button"
              onClick={() => setType("reduce")}
              className={`flex-1 h-9 rounded-md border text-sm font-semibold transition ${type === "reduce" ? "bg-destructive/10 text-destructive border-destructive" : "bg-background text-muted-foreground"}`}
            >
              − Reduce Cash
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Amount (₹) *"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
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
            placeholder="Opening cash, owner drawing, counting correction…"
          />
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
              {saving ? "Saving…" : "Adjust Cash"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

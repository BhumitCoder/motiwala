import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/Field";
import { Banknote, Search, Calendar, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/cash")({ component: CashPage });

function CashPage() {
  const [entries, setEntries] = useState<FlowEntry[]>([]);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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

  // Balance is the true running cash-in-hand as of now — it doesn't change
  // when a date range is applied, only the period's In/Out totals do.
  const balance = entries.reduce((s, e) => s + e.in - e.out, 0);

  const dateFiltered = useMemo(() => {
    if (!dateFrom && !dateTo) return entries;
    return entries.filter(
      (e) => (!dateFrom || e.date >= dateFrom) && (!dateTo || e.date <= dateTo),
    );
  }, [entries, dateFrom, dateTo]);

  const totalIn = dateFiltered.reduce((s, e) => s + e.in, 0);
  const totalOut = dateFiltered.reduce((s, e) => s + e.out, 0);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return dateFiltered;
    return dateFiltered.filter((e) => [e.type, e.ref].some((v) => v.toLowerCase().includes(s)));
  }, [dateFiltered, q]);

  return (
    <div className="flex flex-col h-full bg-[#f5f6fa]">
      <PageHeader
        title="Cash"
        subtitle={`${filtered.length} of ${entries.length} transactions`}
        icon={<Banknote className="h-5 w-5" />}
        actions={
          <>
            <div className="flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-lg border border-gray-200 bg-gray-50/60 shrink-0">
              <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-transparent text-xs text-gray-700 focus:outline-none w-[104px]"
              />
              <span className="text-gray-300 text-xs">–</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-transparent text-xs text-gray-700 focus:outline-none w-[104px]"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className="text-gray-400 hover:text-gray-600 transition"
                  title="Clear date range"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="relative w-56">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search type, reference…"
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 bg-gray-50/60 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition"
              />
            </div>
            <Button size="sm" onClick={() => setAdjustOpen(true)}>
              <Banknote className="h-3.5 w-3.5" /> Adjust Cash
            </Button>
          </>
        }
      />

      <div className="p-6 flex-1 min-h-0 flex">
        <DataTable
          columns={[
            {
              key: "date",
              label: "Date",
              render: (e) => fmtDate(e.date),
              sortValue: (e) => e.date,
            },
            {
              key: "type",
              label: "Type",
              render: (e) => e.type,
              sortValue: (e) => e.type,
            },
            {
              key: "ref",
              label: "Reference",
              render: (e) => e.ref,
              sortValue: (e) => e.ref,
            },
            {
              key: "in",
              label: "Cash In",
              align: "right",
              render: (e) => <span className="tabular-nums">{e.in ? fmtMoney(e.in) : "—"}</span>,
              sortValue: (e) => e.in,
            },
            {
              key: "out",
              label: "Cash Out",
              align: "right",
              render: (e) => <span className="tabular-nums">{e.out ? fmtMoney(e.out) : "—"}</span>,
              sortValue: (e) => e.out,
            },
          ]}
          rows={filtered}
          rowKey={(e) => `${e.date}-${e.type}-${e.ref}-${e.in}-${e.out}`}
          emptyMessage={entries.length === 0 ? "No cash transactions yet" : "No matches for your search"}
          footer={
            <tr>
              <td colSpan={3}>
                Total <span className="text-gray-300">|</span>{" "}
                <span className="tabular-nums">{fmtMoney(balance)}</span>
              </td>
              <td className="text-right tabular-nums">{fmtMoney(totalIn)}</td>
              <td className="text-right tabular-nums">{fmtMoney(totalOut)}</td>
            </tr>
          }
        />
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
          <DialogTitle>Adjust Cash on Hand</DialogTitle>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

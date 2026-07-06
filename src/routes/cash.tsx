import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { Banknote, ArrowDownCircle, ArrowUpCircle, Wallet, Search, Calendar, X } from "lucide-react";
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

  const pg = usePagination(filtered);

  return (
    <div className="flex flex-col h-full bg-[#f5f6fa]">
      <PageHeader
        title="Cash"
        subtitle={`${filtered.length} of ${entries.length} transactions`}
        icon={<Banknote className="h-5 w-5" />}
        actions={
          <>
            <CashCard icon={<ArrowDownCircle className="h-4 w-4" />} label="Cash In" value={totalIn} tone="emerald" />
            <CashCard icon={<ArrowUpCircle className="h-4 w-4" />} label="Cash Out" value={totalOut} tone="rose" />
            <CashCard icon={<Wallet className="h-4 w-4" />} label="Balance" value={balance} tone="primary" />
            <Button size="sm" onClick={() => setAdjustOpen(true)}>
              <Banknote className="h-3.5 w-3.5" /> Adjust Cash
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="bg-white border-b px-5 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <label className="text-xs font-medium text-gray-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-md text-xs px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <label className="text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-md text-xs px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="text-xs text-gray-400 hover:text-gray-600 transition flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search type, reference…"
            className="w-full h-8 pl-8 pr-3 border border-gray-200 rounded-md text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse min-w-max">
              <thead>
                <tr className="bg-gray-50">
                  {["Date", "Type", "Reference", "Cash In", "Cash Out"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200 whitespace-nowrap ${i >= 3 ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pg.paged.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-14 text-gray-400">
                      {entries.length === 0 ? "No cash transactions yet" : "No matches for your search"}
                    </td>
                  </tr>
                ) : (
                  pg.paged.map((e, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
                          {e.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">{e.ref}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 tabular-nums whitespace-nowrap">
                        {e.in ? fmtMoney(e.in) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-rose-600 tabular-nums whitespace-nowrap">
                        {e.out ? fmtMoney(e.out) : "—"}
                      </td>
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

const CASH_TONES = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  rose: { bg: "bg-rose-50", text: "text-rose-600" },
  primary: { bg: "bg-primary-soft", text: "text-primary" },
} as const;

function CashCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: keyof typeof CASH_TONES;
}) {
  const t = CASH_TONES[tone];
  return (
    <div className="shrink-0 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border border-gray-100 bg-white">
      <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${t.bg} ${t.text}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5 whitespace-nowrap">
          {label}
        </p>
        <p className={`text-[14px] font-bold tabular-nums whitespace-nowrap ${t.text}`}>
          {fmtMoney(value)}
        </p>
      </div>
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

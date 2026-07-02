import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { PaymentRepo, PartyRepo, SalesRepo, PurchaseRepo } from "@/repositories";
import type { Payment, PaymentAllocation, PaymentMode, Invoice } from "@/types";
import { fmtMoney, fmtDate, today } from "@/lib/format";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  Trash2,
  Search,
  X,
  CheckCircle2,
  Circle,
  AlertCircle,
  ChevronRight,
  Loader2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { genId } from "@/repositories/base";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePagination, PaginationBar } from "@/components/Pagination";

export const Route = createFileRoute("/payments")({ component: PaymentsPage });

type Tab = "all" | "in" | "out";
const r2 = (n: number) => Math.round(n * 100) / 100;

function PaymentsPage() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [formType, setFormType] = useState<"in" | "out">("in");
  const [editing, setEditing] = useState<Payment | null>(null);

  const refresh = () => setRows(PaymentRepo.all().sort((a, b) => b.date.localeCompare(a.date)));
  useEffect(refresh, []);

  const filtered = rows.filter((r) => {
    if (tab !== "all" && r.type !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.partyName.toLowerCase().includes(q) && !(r.ref ?? "").toLowerCase().includes(q))
        return false;
    }
    return true;
  });

  const totalIn = rows.filter((r) => r.type === "in").reduce((s, r) => s + r.amount, 0);
  const totalOut = rows.filter((r) => r.type === "out").reduce((s, r) => s + r.amount, 0);
  const net = totalIn - totalOut;
  const pg = usePagination(filtered);

  const openForm = (type: "in" | "out") => {
    setFormType(type);
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (r: Payment) => {
    setFormType(r.type);
    setEditing(r);
    setOpen(true);
  };
  const handleDelete = (r: Payment) => {
    if (!confirm("Delete this payment record? Amounts applied to invoices/bills will be reversed."))
      return;
    const repo = r.type === "in" ? SalesRepo : PurchaseRepo;
    if (r.allocations?.length) {
      for (const a of r.allocations) {
        if (repo.get(a.invoiceId)) repo.adjustField(a.invoiceId, "paid", -a.amount);
      }
    } else if (r.ref) {
      // Legacy payment: linked invoice numbers were stored in ref — reverse greedily
      const tokens = r.ref
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const all = repo.all();
      let remaining = r.amount;
      for (const t of tokens) {
        if (remaining <= 0) break;
        const inv = all.find((i) => i.number === t);
        if (!inv) continue;
        const take = Math.min(remaining, inv.paid);
        if (take > 0) {
          repo.update(inv.id, { paid: r2(inv.paid - take) });
          remaining = r2(remaining - take);
        }
      }
    }
    PaymentRepo.remove(r.id);
    refresh();
    toast.success("Payment deleted");
  };

  return (
    <div className="flex flex-col h-full bg-[#f5f6fa]">
      {/* Header */}
      <div className="bg-white border-b px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-primary-soft text-primary flex items-center justify-center">
            <Wallet className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-[17px] font-bold text-gray-800">Payments</h1>
            <p className="text-[12px] text-gray-400">{rows.length} records</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openForm("in")}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-md text-sm font-semibold hover:bg-emerald-700 transition"
          >
            <ArrowDownCircle className="h-4 w-4" /> Receive Payment
          </button>
          <button
            onClick={() => openForm("out")}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-600 text-white rounded-md text-sm font-semibold hover:bg-rose-700 transition"
          >
            <ArrowUpCircle className="h-4 w-4" /> Make Payment
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-0 bg-white border-b">
        <div className="px-5 py-3.5 border-r border-gray-100">
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1">
            Total Received
          </p>
          <p className="text-[20px] font-bold tabular-nums text-emerald-600">{fmtMoney(totalIn)}</p>
        </div>
        <div className="px-5 py-3.5 border-r border-gray-100">
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1">
            Total Paid Out
          </p>
          <p className="text-[20px] font-bold tabular-nums text-rose-600">{fmtMoney(totalOut)}</p>
        </div>
        <div className="px-5 py-3.5">
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1">
            Net Cash Flow
          </p>
          <p
            className={`text-[20px] font-bold tabular-nums ${net >= 0 ? "text-emerald-600" : "text-rose-600"}`}
          >
            {fmtMoney(net)}
          </p>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="bg-white border-b px-5 py-2 flex items-center gap-4">
        <div className="flex gap-1">
          {(["all", "in", "out"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                tab === t
                  ? t === "in"
                    ? "bg-emerald-50 text-emerald-700"
                    : t === "out"
                      ? "bg-rose-50 text-rose-700"
                      : "bg-gray-100 text-gray-700"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {t === "all" ? "All" : t === "in" ? "Received (In)" : "Paid Out"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 border border-gray-200 rounded-md px-2.5 py-1.5 bg-white flex-1 max-w-xs ml-auto">
          <Search className="h-3.5 w-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search party, reference…"
            className="text-xs flex-1 outline-none placeholder-gray-400 bg-transparent"
          />
          {search && (
            <button onClick={() => setSearch("")}>
              <X className="h-3 w-3 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead className="sticky top-0 bg-white border-b z-10">
            <tr>
              {[
                "Date",
                "Type",
                "Party",
                "Linked Invoice / Bill",
                "Mode",
                "Reference",
                "Amount",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className={`px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 whitespace-nowrap bg-white ${h === "Amount" ? "text-right" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-20 text-gray-400">
                  <Wallet className="h-10 w-10 mx-auto mb-3 text-gray-200" />
                  <p className="font-medium">No payments recorded</p>
                  <p className="text-xs mt-1">Use the buttons above to record a payment</p>
                </td>
              </tr>
            ) : (
              pg.paged.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors group"
                >
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3">
                    {r.type === "in" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <ArrowDownCircle className="h-3 w-3" /> Received
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                        <ArrowUpCircle className="h-3 w-3" /> Paid Out
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-[150px] truncate">
                    {r.partyName}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-blue-600">
                    {r.allocations?.length ? (
                      r.allocations.map((a) => a.number).join(", ")
                    ) : r.ref && r.ref.match(/^(INV|PUR)-/) ? (
                      r.ref
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 capitalize text-xs">{r.mode}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">
                    {r.ref && (r.allocations?.length || !r.ref.match(/^(INV|PUR)-/)) ? r.ref : "—"}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-bold tabular-nums text-sm ${r.type === "in" ? "text-emerald-600" : "text-rose-600"}`}
                  >
                    {r.type === "out" ? "−" : "+"}
                    {fmtMoney(r.amount)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      onClick={() => openEdit(r)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"
                      title="Edit payment"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition"
                      title="Delete payment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="sticky bottom-0 bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={6} className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">
                  {filtered.length} record{filtered.length !== 1 ? "s" : ""}
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-sm text-gray-800">
                  {fmtMoney(
                    filtered.reduce((s, r) => s + (r.type === "in" ? r.amount : -r.amount), 0),
                  )}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
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

      <ReceivePaymentDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
        type={formType}
        editing={editing}
        onSaved={refresh}
      />
    </div>
  );
}

/* ─── Proper Payment Dialog ──────────────────────────────────────────── */

interface ApplyRow {
  invoice: Invoice;
  due: number;
  apply: number;
  checked: boolean;
}

function ReceivePaymentDialog({
  open,
  onOpenChange,
  type,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: "in" | "out";
  editing: Payment | null;
  onSaved: () => void;
}) {
  const isIn = type === "in";
  const partyRef = useRef<HTMLInputElement>(null);
  const allParties = useMemo(() => PartyRepo.all(), []);

  const [partyQ, setPartyQ] = useState("");
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyIdx, setPartyIdx] = useState(0);
  const [selectedParty, setSelectedParty] = useState<{ id: string; name: string } | null>(null);

  const [date, setDate] = useState(today());
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [ref, setRef] = useState("");
  const [applyRows, setApplyRows] = useState<ApplyRow[]>([]);
  const [manualAmount, setManualAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const suggests = partyQ.trim()
    ? allParties.filter((p) => p.name.toLowerCase().includes(partyQ.toLowerCase())).slice(0, 6)
    : [];

  // Reset (or prefill when editing) on open
  useEffect(() => {
    if (open) {
      if (editing) {
        setPartyQ(editing.partyName);
        setSelectedParty({ id: editing.partyId, name: editing.partyName });
        setDate(editing.date);
        setMode(editing.mode);
        setRef(editing.ref ?? "");
        setManualAmount(editing.allocations?.length ? "" : String(editing.amount));
      } else {
        setPartyQ("");
        setSelectedParty(null);
        setDate(today());
        setMode("cash");
        setRef("");
        setManualAmount("");
        setTimeout(() => partyRef.current?.focus(), 60);
      }
      setApplyRows([]);
      setSaving(false);
      savingRef.current = false;
    }
  }, [open, editing]);

  // Load invoices/bills when party selected. When editing, this payment's own
  // allocations are added back to each invoice's due and pre-selected.
  useEffect(() => {
    if (!selectedParty) {
      setApplyRows([]);
      return;
    }
    const repo = isIn ? SalesRepo : PurchaseRepo;
    const allocOf = new Map((editing?.allocations ?? []).map((a) => [a.invoiceId, a.amount]));
    const invoices = repo
      .all()
      .filter(
        (inv) =>
          inv.partyId === selectedParty.id &&
          (r2(inv.total - inv.paid) > 0.01 || allocOf.has(inv.id)),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    setApplyRows(
      invoices.map((inv) => {
        const back = allocOf.get(inv.id) ?? 0;
        return {
          invoice: inv,
          due: r2(inv.total - inv.paid + back),
          apply: back,
          checked: back > 0,
        };
      }),
    );
  }, [selectedParty, isIn, editing]);

  const selectParty = (p: { id: string; name: string }) => {
    setSelectedParty(p);
    setPartyQ(p.name);
    setPartyOpen(false);
  };

  const totalOutstanding = applyRows.reduce((s, r) => s + r.due, 0);
  const totalApplied = r2(applyRows.reduce((s, r) => s + r.apply, 0));
  // Advance / general payment when there are no open invoices to apply to
  const effectiveAmount = applyRows.length > 0 ? totalApplied : parseFloat(manualAmount) || 0;

  const toggleRow = (idx: number) => {
    setApplyRows((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r;
        const checked = !r.checked;
        return { ...r, checked, apply: checked ? r.due : 0 };
      }),
    );
  };

  const setApply = (idx: number, val: string) => {
    const num = parseFloat(val) || 0;
    setApplyRows((rows) =>
      rows.map((r, i) =>
        i === idx ? { ...r, apply: Math.min(r.due, Math.max(0, num)), checked: num > 0 } : r,
      ),
    );
  };

  const applyAll = () => {
    setApplyRows((rows) => rows.map((r) => ({ ...r, checked: true, apply: r.due })));
  };

  const clearAll = () => {
    setApplyRows((rows) => rows.map((r) => ({ ...r, checked: false, apply: 0 })));
  };

  const save = () => {
    if (savingRef.current) return; // double-click protection
    if (!selectedParty && !partyQ.trim()) {
      toast.error("Select or enter a party");
      return;
    }
    const amount = effectiveAmount;
    if (!amount || amount <= 0) {
      toast.error("Enter or select an amount to pay");
      return;
    }
    savingRef.current = true;
    setSaving(true);

    let partyId = selectedParty?.id ?? "";
    const partyName = selectedParty?.name ?? partyQ.trim();
    if (!partyId) {
      const match = allParties.find((p) => p.name.toLowerCase() === partyName.toLowerCase());
      partyId = match?.id ?? genId();
      if (!match) PartyRepo.add({ id: partyId, name: partyName, type: "both", openingBalance: 0 });
    }

    const repo = isIn ? SalesRepo : PurchaseRepo;

    // Editing: first reverse this payment's previous applications (atomic)
    if (editing?.allocations?.length) {
      for (const a of editing.allocations) {
        if (repo.get(a.invoiceId)) repo.adjustField(a.invoiceId, "paid", -a.amount);
      }
    }

    // Apply to invoices — atomic increments so simultaneous cashiers both count
    const allocations: PaymentAllocation[] = [];
    for (const row of applyRows) {
      if (row.apply > 0) {
        const cur = repo.get(row.invoice.id);
        if (!cur) continue;
        repo.adjustField(cur.id, "paid", r2(row.apply));
        allocations.push({ invoiceId: cur.id, number: cur.number, amount: r2(row.apply) });
      }
    }

    // Record payment
    if (editing) {
      PaymentRepo.update(editing.id, {
        date,
        partyId,
        partyName,
        type,
        amount: r2(amount),
        mode,
        ref: ref.trim() || undefined,
        allocations: allocations.length ? allocations : undefined,
      });
    } else {
      const payment: Payment = {
        id: genId(),
        date,
        partyId,
        partyName,
        type,
        amount: r2(amount),
        mode,
        ref: ref.trim() || undefined,
        allocations: allocations.length ? allocations : undefined,
        createdAt: new Date().toISOString(),
      };
      PaymentRepo.add(payment);
    }

    const invWord = isIn ? "invoice" : "bill";
    if (editing) {
      toast.success(`Payment updated — ${fmtMoney(amount)}`);
    } else if (allocations.length) {
      toast.success(
        `${fmtMoney(amount)} applied to ${allocations.length} ${invWord}${allocations.length > 1 ? "s" : ""}`,
      );
    } else {
      toast.success(`Payment ${isIn ? "received" : "sent"} recorded`);
    }
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {isIn ? (
              <>
                <ArrowDownCircle className="h-5 w-5 text-emerald-600" />{" "}
                {editing ? "Edit Payment (Received)" : "Receive Payment from Customer"}
              </>
            ) : (
              <>
                <ArrowUpCircle className="h-5 w-5 text-rose-600" />{" "}
                {editing ? "Edit Payment (Paid Out)" : "Make Payment to Supplier"}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Party search */}
          <div className="relative">
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="font-semibold text-gray-600">
                {isIn ? "Customer (Received From)" : "Supplier (Paid To)"} *
              </span>
              <input
                ref={partyRef}
                value={partyQ}
                onChange={(e) => {
                  setPartyQ(e.target.value);
                  setPartyOpen(true);
                  setPartyIdx(0);
                  setSelectedParty(null);
                  setApplyRows([]);
                }}
                onFocus={() => partyQ && setPartyOpen(true)}
                onBlur={() => setTimeout(() => setPartyOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPartyIdx((i) => Math.min(suggests.length - 1, i + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPartyIdx((i) => Math.max(0, i - 1));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (suggests[partyIdx]) selectParty(suggests[partyIdx]);
                  }
                }}
                className="h-9 px-3 border rounded-md bg-background focus:border-primary focus:ring-2 focus:ring-ring/20 outline-none text-sm"
                placeholder="Type to search party…"
              />
            </label>
            {partyOpen && suggests.length > 0 && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 border rounded-md bg-popover shadow-lg max-h-40 overflow-auto">
                {suggests.map((p, i) => (
                  <div
                    key={p.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectParty(p);
                    }}
                    className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between ${i === partyIdx ? "bg-accent" : "hover:bg-accent"}`}
                  >
                    <span className="font-medium">{p.name}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outstanding panel */}
          {selectedParty && (
            <div
              className={`rounded-lg border-2 p-4 ${isIn ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {isIn ? "Outstanding Receivable from" : "Outstanding Payable to"}{" "}
                    {selectedParty.name}
                  </p>
                  <p
                    className={`text-[22px] font-bold tabular-nums mt-0.5 ${isIn ? "text-emerald-700" : "text-rose-700"}`}
                  >
                    {fmtMoney(totalOutstanding)}
                  </p>
                </div>
                {applyRows.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={applyAll}
                      className="text-xs px-2 py-1 rounded bg-white border font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Apply All
                    </button>
                    <button
                      onClick={clearAll}
                      className="text-xs px-2 py-1 rounded bg-white border font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {applyRows.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-gray-500 bg-white/60 rounded-md px-3 py-2">
                  <AlertCircle className="h-4 w-4 text-gray-400" />
                  No outstanding {isIn ? "invoices" : "bills"} — this will be recorded as an advance
                  payment
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    {applyRows.length} Open {isIn ? "Invoice" : "Bill"}
                    {applyRows.length > 1 ? "s" : ""} — select to settle:
                  </p>
                  <div className="bg-white rounded-md border border-gray-200 overflow-hidden max-h-48 overflow-y-auto">
                    {applyRows.map((row, idx) => (
                      <div
                        key={row.invoice.id}
                        className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 last:border-0 transition ${row.checked ? (isIn ? "bg-emerald-50/50" : "bg-rose-50/50") : ""}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleRow(idx)}
                          className="shrink-0 mt-0.5"
                        >
                          {row.checked ? (
                            <CheckCircle2
                              className={`h-5 w-5 ${isIn ? "text-emerald-600" : "text-rose-500"}`}
                            />
                          ) : (
                            <Circle className="h-5 w-5 text-gray-300" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-xs text-blue-600">
                              {row.invoice.number}
                            </span>
                            <span className="text-xs text-gray-400">
                              {fmtDate(row.invoice.date)}
                            </span>
                            {row.invoice.paid > 0 && (
                              <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                                Partial
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            Total {fmtMoney(row.invoice.total)} · Already paid{" "}
                            {fmtMoney(row.invoice.paid)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[10px] text-gray-400 mb-1">Due</p>
                          <p
                            className={`text-sm font-bold tabular-nums ${isIn ? "text-emerald-700" : "text-rose-700"}`}
                          >
                            {fmtMoney(row.due)}
                          </p>
                        </div>
                        <div className="shrink-0 w-24">
                          <p className="text-[10px] text-gray-400 mb-1 text-right">Apply (₹)</p>
                          <input
                            type="number"
                            value={row.apply || ""}
                            min={0}
                            max={row.due}
                            step="0.01"
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) => setApply(idx, e.target.value)}
                            placeholder="0.00"
                            className={`w-full h-7 px-2 text-right text-xs border rounded outline-none focus:ring-1 ${row.checked ? (isIn ? "border-emerald-400 focus:ring-emerald-300 bg-white" : "border-rose-400 focus:ring-rose-300 bg-white") : "border-gray-200 bg-gray-50"} tabular-nums`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Use manual amount toggle when no invoices */}
              {applyRows.length === 0 && (
                <div className="mt-3">
                  <label className="text-[12px] font-semibold text-gray-600 block mb-1">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    value={manualAmount}
                    min={0}
                    step="0.01"
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => setManualAmount(e.target.value)}
                    className={`w-full h-9 px-3 border-2 rounded-md text-right font-bold text-lg outline-none focus:border-primary ${isIn ? "text-emerald-700" : "text-rose-700"}`}
                    placeholder="0.00"
                  />
                </div>
              )}
            </div>
          )}

          {/* No party selected — show general amount input */}
          {!selectedParty && (
            <div className="rounded-lg border bg-gray-50 p-4">
              <label className="text-[12px] font-semibold text-gray-600 block mb-1">
                Amount (₹) *
              </label>
              <input
                type="number"
                value={manualAmount}
                min={0}
                step="0.01"
                onWheel={(e) => e.currentTarget.blur()}
                onChange={(e) => setManualAmount(e.target.value)}
                className={`w-full h-9 px-3 border-2 rounded-md text-right font-bold text-lg outline-none focus:border-primary ${isIn ? "text-emerald-700" : "text-rose-700"}`}
                placeholder="0.00"
              />
            </div>
          )}

          {/* Payment details */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1 text-[12px]">
              <label className="font-semibold text-gray-600">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 px-2 border rounded bg-white focus:border-primary outline-none text-sm"
              />
            </div>
            <div className="flex flex-col gap-1 text-[12px]">
              <label className="font-semibold text-gray-600">Payment Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as PaymentMode)}
                className="h-8 px-2 border rounded bg-white focus:border-primary outline-none text-sm"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 text-[12px]">
              <label className="font-semibold text-gray-600">Reference / Note</label>
              <input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="UPI ref, cheque #…"
                className="h-8 px-2 border rounded bg-white focus:border-primary outline-none text-sm"
              />
            </div>
          </div>

          {/* Total + Actions */}
          <div
            className={`rounded-lg border-2 p-4 flex items-center justify-between ${isIn ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}
          >
            <div>
              <p className="text-xs text-gray-500 font-medium">
                {applyRows.some((r) => r.checked)
                  ? `Applied to ${applyRows.filter((r) => r.checked).length} ${isIn ? "invoice" : "bill"}${applyRows.filter((r) => r.checked).length > 1 ? "s" : ""}`
                  : "General payment (advance)"}
              </p>
              <p
                className={`text-[22px] font-extrabold tabular-nums ${isIn ? "text-emerald-700" : "text-rose-700"}`}
              >
                {fmtMoney(effectiveAmount)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={save}
                disabled={saving}
                className={
                  isIn
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-rose-600 hover:bg-rose-700 text-white"
                }
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…
                  </>
                ) : isIn ? (
                  <>
                    <ArrowDownCircle className="h-4 w-4 mr-1.5" /> Confirm Receipt
                  </>
                ) : (
                  <>
                    <ArrowUpCircle className="h-4 w-4 mr-1.5" /> Confirm Payment
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

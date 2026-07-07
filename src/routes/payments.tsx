import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  PaymentRepo,
  PartyRepo,
  SalesRepo,
  PurchaseRepo,
  SaleReturnRepo,
  PurchaseReturnRepo,
  BankRepo,
} from "@/repositories";
import { newBatch, commitBatch } from "@/repositories/base";
import type { Payment, PaymentAllocation, PaymentMode, Invoice, BankAccount } from "@/types";
import { fmtMoney, fmtDate, today } from "@/lib/format";
import { partyBalances } from "@/lib/ledger";
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
  TrendingUp,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { genId } from "@/repositories/base";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/DataTable";
import { ModePills, fmtMode } from "@/components/ModePills";
import { PageHeader } from "@/components/PageHeader";

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
    // Invoice-paid reversal, bank-balance reversal, and the payment removal
    // itself must all land together — a shared batch commits them atomically.
    const batch = newBatch();
    if (r.allocations?.length) {
      for (const a of r.allocations) {
        if (repo.get(a.invoiceId)) repo.adjustFieldBatched(batch, a.invoiceId, "paid", -a.amount);
      }
    } else if (r.ref) {
      // Legacy payment (predates per-invoice allocations): only a lump amount
      // and a comma-separated list of invoice numbers was stored, with no
      // record of how much actually went to each one. There's no way to
      // recover the true original split, so distribute the reversal
      // proportionally to each invoice's CURRENT paid amount — this is the
      // closest fair approximation and, unlike taking a fixed amount per
      // invoice in list order, never leaves a leftover silently undone when
      // an earlier invoice's paid has since dropped below its original share.
      const tokens = r.ref
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const all = repo.all();
      const invoices = tokens
        .map((t) => all.find((i) => i.number === t))
        .filter((i): i is Invoice => !!i && i.paid > 0);
      const totalPaid = invoices.reduce((s, inv) => s + inv.paid, 0);
      const totalReverse = Math.min(r.amount, totalPaid);
      if (totalReverse > 0) {
        for (const inv of invoices) {
          const take = Math.min(inv.paid, r2((inv.paid / totalPaid) * totalReverse));
          if (take > 0) repo.updateBatched(batch, inv.id, { paid: r2(inv.paid - take) });
        }
      }
    }
    // Money that was moved onto a specific bank account when this payment
    // was recorded must be moved back off it, or the account balance stays
    // permanently wrong after the payment is deleted.
    if (r.mode === "bank" && r.bankId && BankRepo.get(r.bankId)) {
      BankRepo.adjustFieldBatched(batch, r.bankId, "balance", r.type === "in" ? -r.amount : r.amount);
    }
    PaymentRepo.removeBatched(batch, r.id);
    commitBatch(batch, "delete payment");
    refresh();
    toast.success("Payment deleted");
  };

  const columns: Column<Payment>[] = [
    {
      key: "date",
      label: "Date",
      width: "100px",
      render: (r) => <span className="whitespace-nowrap">{fmtDate(r.date)}</span>,
      sortValue: (r) => r.date,
    },
    {
      key: "type",
      label: "Type",
      width: "120px",
      render: (r) =>
        r.type === "in" ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <ArrowDownCircle className="h-3 w-3" /> Received
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
            <ArrowUpCircle className="h-3 w-3" /> Paid Out
          </span>
        ),
      sortValue: (r) => r.type,
    },
    {
      key: "party",
      label: "Party",
      render: (r) => <span className="font-medium text-gray-800">{r.partyName}</span>,
      sortValue: (r) => r.partyName,
    },
    {
      key: "linked",
      label: "Linked Invoice / Bill",
      render: (r) => (
        <span className="font-mono text-xs text-blue-600">
          {r.allocations?.length ? (
            r.allocations.map((a) => a.number).join(", ")
          ) : r.ref && r.ref.match(/^(INV|PUR)-/) ? (
            r.ref
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </span>
      ),
    },
    {
      key: "mode",
      label: "Mode",
      width: "90px",
      render: (r) => <span className="text-gray-500 text-xs">{fmtMode(r.mode)}</span>,
    },
    {
      key: "ref",
      label: "Reference",
      render: (r) => (
        <span className="font-mono text-xs text-gray-400">
          {r.ref && (r.allocations?.length || !r.ref.match(/^(INV|PUR)-/)) ? r.ref : "—"}
        </span>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      width: "120px",
      align: "right",
      render: (r) => (
        <span
          className={`font-bold tabular-nums ${r.type === "in" ? "text-emerald-600" : "text-rose-600"}`}
        >
          {r.type === "out" ? "−" : "+"}
          {fmtMoney(r.amount)}
        </span>
      ),
      sortValue: (r) => (r.type === "in" ? r.amount : -r.amount),
    },
    {
      key: "actions",
      label: "Action",
      width: "70px",
      align: "center",
      render: (r) => (
        <span className="inline-flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEdit(r);
            }}
            className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"
            title="Edit payment"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(r);
            }}
            className="p-1 rounded hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition"
            title="Delete payment"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#f5f6fa]">
      <PageHeader
        title="Payments"
        subtitle={`${rows.length} records`}
        icon={<Wallet className="h-5 w-5" />}
        actions={
          <>
            <PaymentCard icon={ArrowDownCircle} label="Total Received" value={totalIn} tone="emerald" />
            <PaymentCard icon={ArrowUpCircle} label="Total Paid Out" value={totalOut} tone="rose" />
            <PaymentCard
              icon={net >= 0 ? TrendingUp : TrendingDown}
              label="Net Cash Flow"
              value={net}
              tone={net >= 0 ? "emerald" : "rose"}
            />
            <button
              onClick={() => openForm("in")}
              className="inline-flex items-center gap-1.5 h-8 px-3 bg-emerald-600 text-white rounded-md text-sm font-semibold hover:bg-emerald-700 transition"
            >
              <ArrowDownCircle className="h-4 w-4" /> Receive Payment
            </button>
            <button
              onClick={() => openForm("out")}
              className="inline-flex items-center gap-1.5 h-8 px-3 bg-rose-600 text-white rounded-md text-sm font-semibold hover:bg-rose-700 transition"
            >
              <ArrowUpCircle className="h-4 w-4" /> Make Payment
            </button>
          </>
        }
      />

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

      <div className="p-3 flex-1 min-h-0 flex">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          onRowActivate={openEdit}
          onDelete={handleDelete}
          emptyMessage="No payments recorded — use the buttons above to record one"
        />
      </div>

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

const PAYMENT_TONES = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  rose: { bg: "bg-rose-50", text: "text-rose-600" },
} as const;

function PaymentCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: keyof typeof PAYMENT_TONES;
}) {
  const t = PAYMENT_TONES[tone];
  return (
    <div className="shrink-0 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border border-gray-100 bg-white">
      <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${t.bg} ${t.text}`}>
        <Icon className="h-4 w-4" />
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
  // Refreshed every time the dialog opens (not memoized once) — otherwise a
  // party created by an earlier payment in this same session (e.g. a
  // walk-in customer typed by name) would never show up in the dedupe
  // lookup or the search suggestions, creating a duplicate Party record.
  const [allParties, setAllParties] = useState<{ id: string; name: string }[]>([]);

  const [partyQ, setPartyQ] = useState("");
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyIdx, setPartyIdx] = useState(0);
  const [selectedParty, setSelectedParty] = useState<{ id: string; name: string } | null>(null);

  const [date, setDate] = useState(today());
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [bankId, setBankId] = useState("");
  const [bankQ, setBankQ] = useState("");
  const [bankOpen, setBankOpen] = useState(false);
  const [bankIdx, setBankIdx] = useState(0);
  const [applyRows, setApplyRows] = useState<ApplyRow[]>([]);
  const [manualAmount, setManualAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const suggests = partyQ.trim()
    ? allParties.filter((p) => p.name.toLowerCase().includes(partyQ.toLowerCase())).slice(0, 6)
    : [];

  const bankSuggests = bankQ.trim()
    ? banks.filter(
        (b) =>
          b.name.toLowerCase().includes(bankQ.toLowerCase()) ||
          (b.accountNumber ?? "").toLowerCase().includes(bankQ.toLowerCase()),
      )
    : banks;
  const selectBank = (b: BankAccount) => {
    setBankId(b.id);
    setBankQ(b.name);
    setBankOpen(false);
  };

  // Reset (or prefill when editing) on open
  useEffect(() => {
    if (open) {
      setAllParties(PartyRepo.all());
      setBanks(BankRepo.all());
      if (editing) {
        setPartyQ(editing.partyName);
        setSelectedParty({ id: editing.partyId, name: editing.partyName });
        setDate(editing.date);
        setMode(editing.mode);
        setBankId(editing.bankId ?? "");
        setBankQ(BankRepo.all().find((b) => b.id === editing.bankId)?.name ?? "");
        setManualAmount(editing.allocations?.length ? "" : String(editing.amount));
      } else {
        setPartyQ("");
        setSelectedParty(null);
        setDate(today());
        setMode("cash");
        setBankId("");
        setBankQ("");
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
  // The invoice-level "due" total above misses debt that isn't tied to any
  // invoice at all — most commonly a party's opening balance carried over
  // from before this system was used. Without this, a party who owes only
  // an opening balance (no unpaid invoices) would show "₹0.00 outstanding /
  // no invoices" here even though the Dashboard and their own statement
  // correctly show they owe money.
  const partyTrueBalance = (() => {
    if (!selectedParty) return 0;
    const repo = isIn ? SalesRepo : PurchaseRepo;
    const returnRepo = isIn ? SaleReturnRepo : PurchaseReturnRepo;
    const list = partyBalances(
      repo.all(),
      returnRepo.all(),
      PaymentRepo.all().filter((p) => p.type === (isIn ? "in" : "out")),
      PartyRepo.all().filter((p) => (isIn ? p.type !== "supplier" : p.type !== "customer")),
    );
    return list.find((b) => b.partyId === selectedParty.id)?.balance ?? 0;
  })();
  // Portion of the true balance not already represented by an open invoice
  // row above (e.g. opening balance, or a manual ledger correction).
  const unlinkedBalance = Math.max(0, r2(partyTrueBalance - totalOutstanding));
  const totalApplied = r2(applyRows.reduce((s, r) => s + r.apply, 0));
  // Advance / general payment whenever nothing is actually applied to an
  // invoice — not just when there are no open invoices at all. Without this,
  // editing an old advance payment for a party that has since accrued open
  // invoices would populate an all-unchecked list, drive this to 0, hide the
  // manual amount field (it was only shown when applyRows.length===0), and
  // permanently block saving.
  const effectiveAmount = totalApplied > 0 ? totalApplied : parseFloat(manualAmount) || 0;

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
    if (!date) {
      toast.error("Enter a payment date");
      return;
    }
    const amount = effectiveAmount;
    if (!amount || amount <= 0) {
      toast.error("Enter or select an amount to pay");
      return;
    }
    if (mode === "bank" && !bankId) {
      toast.error("Select which bank account this goes to");
      return;
    }
    savingRef.current = true;
    setSaving(true);

    // Wrapped so an unexpected failure partway through (reversing an old
    // allocation, applying new ones, persisting the Payment record) can't
    // leave the Confirm button permanently stuck disabled/spinning — saving
    // state is only otherwise reset by the dialog's open effect.
    try {
      // Party creation, invoice-paid changes, bank-balance changes, and the
      // Payment record itself must all land together — a shared batch
      // commits them atomically instead of independent writes that could
      // partially fail (e.g. money moves on the bank account but the
      // invoice never shows as paid).
      const batch = newBatch();

      let partyId = selectedParty?.id ?? "";
      const partyName = selectedParty?.name ?? partyQ.trim();
      if (!partyId) {
        const match = allParties.find((p) => p.name.toLowerCase() === partyName.toLowerCase());
        partyId = match?.id ?? genId();
        if (!match)
          PartyRepo.addBatched(batch, { id: partyId, name: partyName, type: "both", openingBalance: 0 });
      }

      const repo = isIn ? SalesRepo : PurchaseRepo;

      // Editing: first reverse this payment's previous applications (atomic)
      if (editing?.allocations?.length) {
        for (const a of editing.allocations) {
          if (repo.get(a.invoiceId)) repo.adjustFieldBatched(batch, a.invoiceId, "paid", -a.amount);
        }
      }
      // Editing: reverse the old bank-account effect too, before applying
      // the new one below — handles both "same account, new amount" and
      // "switched to a different account" correctly.
      if (editing?.mode === "bank" && editing.bankId && BankRepo.get(editing.bankId)) {
        BankRepo.adjustFieldBatched(
          batch,
          editing.bankId,
          "balance",
          editing.type === "in" ? -editing.amount : editing.amount,
        );
      }

      // Apply to invoices — atomic increments so simultaneous cashiers both count.
      // row.due/row.apply were computed from a snapshot taken when the party
      // was selected, which can go stale if another payment lands on the same
      // invoice before this one saves (this payment's own prior allocation was
      // already reversed above, so `cur` here reflects that reversal too) —
      // re-check against the live due right before applying so paid can never
      // be pushed past total.
      const allocations: PaymentAllocation[] = [];
      let clamped = false;
      for (const row of applyRows) {
        if (row.apply > 0) {
          const cur = repo.get(row.invoice.id);
          if (!cur) continue;
          const liveDue = Math.max(0, r2(cur.total - cur.paid));
          const amt = Math.min(r2(row.apply), liveDue);
          if (amt <= 0) continue;
          if (amt < r2(row.apply)) clamped = true;
          repo.adjustFieldBatched(batch, cur.id, "paid", amt);
          allocations.push({ invoiceId: cur.id, number: cur.number, amount: amt });
        }
      }
      if (clamped) {
        toast.warning(
          "Some amounts were reduced — one or more invoices had already been partly paid elsewhere",
        );
      }

      // Move money on the selected bank account for this (new) payment.
      if (mode === "bank" && bankId) {
        BankRepo.adjustFieldBatched(batch, bankId, "balance", isIn ? amount : -amount);
      }

      // Record payment
      if (editing) {
        PaymentRepo.updateBatched(batch, editing.id, {
          date,
          partyId,
          partyName,
          type,
          amount: r2(amount),
          mode,
          bankId: mode === "bank" ? bankId : undefined,
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
          bankId: mode === "bank" ? bankId : undefined,
          allocations: allocations.length ? allocations : undefined,
          createdAt: new Date().toISOString(),
        };
        PaymentRepo.addBatched(batch, payment);
      }

      commitBatch(batch, "save payment");

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
    } catch (err) {
      console.error("Payment save failed", err);
      toast.error("Could not save payment — please try again");
      savingRef.current = false;
      setSaving(false);
    }
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
                    {fmtMoney(totalOutstanding + unlinkedBalance)}
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
                  {unlinkedBalance > 0.01
                    ? `No open ${isIn ? "invoices" : "bills"}, but this party carries a balance of ${fmtMoney(unlinkedBalance)} (e.g. opening balance) — payment will be recorded as an advance against it`
                    : `No outstanding ${isIn ? "invoices" : "bills"} — this will be recorded as an advance payment`}
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

              {/* Manual amount — shown whenever nothing is applied to an invoice
                  yet, whether because there are none or none are checked */}
              {totalApplied === 0 && (
                <div className="mt-3">
                  <label className="text-[12px] font-semibold text-gray-600 block mb-1">
                    {applyRows.length > 0 ? "Or record as advance (₹)" : "Amount (₹) *"}
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
          <div className="grid grid-cols-2 gap-3">
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
              <div className="flex items-center h-8">
                <ModePills
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    if (m !== "bank") {
                      setBankId("");
                      setBankQ("");
                    }
                  }}
                  modes={["cash", "bank"]}
                />
              </div>
            </div>
          </div>

          {mode === "bank" && (
            <div className="relative flex flex-col gap-1 text-[12px]">
              <label className="font-semibold text-gray-600">Bank Account *</label>
              <input
                value={bankQ}
                onChange={(e) => {
                  setBankQ(e.target.value);
                  setBankOpen(true);
                  setBankIdx(0);
                  if (bankId) setBankId("");
                }}
                onFocus={() => setBankOpen(true)}
                onBlur={() => setTimeout(() => setBankOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setBankIdx((i) => Math.min(bankSuggests.length - 1, i + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setBankIdx((i) => Math.max(0, i - 1));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (bankSuggests[bankIdx]) selectBank(bankSuggests[bankIdx]);
                  }
                }}
                placeholder="Search bank account…"
                className="h-9 px-2 border rounded-md bg-white focus:border-primary outline-none text-sm"
              />
              {bankOpen && bankSuggests.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 border rounded-md bg-popover shadow-lg max-h-40 overflow-auto">
                  {bankSuggests.map((b, i) => (
                    <div
                      key={b.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectBank(b);
                      }}
                      className={`px-3 py-2 text-sm cursor-pointer ${i === bankIdx ? "bg-accent" : "hover:bg-accent"}`}
                    >
                      {b.name}
                      {b.accountNumber ? ` — ${b.accountNumber}` : ""} ({fmtMoney(b.balance)})
                    </div>
                  ))}
                </div>
              )}
              {bankOpen && bankQ && bankSuggests.length === 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 border rounded-md bg-popover shadow-lg px-3 py-2 text-xs text-muted-foreground">
                  No matching bank account
                </div>
              )}
              {banks.length === 0 && (
                <p className="text-[11px] text-amber-600">
                  No bank accounts set up yet — add one from Bank Accounts first.
                </p>
              )}
            </div>
          )}

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

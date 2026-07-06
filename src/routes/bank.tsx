import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import {
  BankRepo,
  SalesRepo,
  PurchaseRepo,
  ExpenseRepo,
  PaymentRepo,
  BankTxnRepo,
  CashAdjustmentRepo,
} from "@/repositories";
import { bankFlows, netFlow } from "@/lib/ledger";
import type { BankAccount } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/Field";
import { NumField } from "@/components/NumInput";
import { fmtMoney, today } from "@/lib/format";
import { Plus, ArrowDownToLine, ArrowUpFromLine, History, Pencil, Landmark } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/bank")({ component: BankPage });

function BankPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<BankAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<BankAccount | null>(null);
  const [txnOpen, setTxnOpen] = useState(false);
  const refresh = () => setRows(BankRepo.all());
  useEffect(refresh, []);

  const columns: Column<BankAccount>[] = [
    {
      key: "name",
      label: "Account Name",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "acc",
      label: "Account No.",
      width: "180px",
      render: (r) => <span className="font-mono text-xs">{r.accountNumber ?? "—"}</span>,
    },
    {
      key: "ifsc",
      label: "IFSC",
      width: "120px",
      render: (r) => <span className="font-mono text-xs">{r.ifsc ?? "—"}</span>,
    },
    {
      key: "opening",
      label: "Opening",
      align: "right",
      width: "120px",
      render: (r) => fmtMoney(r.openingBalance),
    },
    {
      key: "balance",
      label: "Balance",
      align: "right",
      width: "140px",
      render: (r) => <span className="font-semibold">{fmtMoney(r.balance)}</span>,
    },
    {
      key: "actions",
      label: "Action",
      width: "80px",
      align: "center",
      render: (r) => (
        <span className="inline-flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate({ to: "/bank/$id", params: { id: r.id } });
            }}
            className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"
            title="View passbook / transaction history"
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEdit(r);
              setOpen(true);
            }}
            className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"
            title="Edit account"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </span>
      ),
    },
  ];

  const accountsTotal = rows.reduce((s, r) => s + r.balance, 0);
  const openingTotal = rows.reduce((s, r) => s + r.openingBalance, 0);
  // All bank/UPI/cheque activity (sales, purchases, expenses, payments) affects the real balance
  const bankActivity = netFlow(
    bankFlows(SalesRepo.all(), PurchaseRepo.all(), ExpenseRepo.all(), PaymentRepo.all()),
  );
  const totalBalance = accountsTotal + bankActivity;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Bank Accounts"
        subtitle={`${rows.length} accounts · Opening: ${fmtMoney(openingTotal)} · Bank transactions: ${bankActivity >= 0 ? "+" : "−"}${fmtMoney(Math.abs(bankActivity))} · Total: ${fmtMoney(totalBalance)}`}
        icon={<Landmark className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {rows.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTxnOpen(true)}
                title="Deposit / Withdraw"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />{" "}
                <span className="hidden sm:inline">Deposit / Withdraw</span>
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                setEdit(null);
                setOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> New Account
            </Button>
          </div>
        }
      />
      <div className="p-3 flex-1 min-h-0 flex">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowActivate={(r) => navigate({ to: "/bank/$id", params: { id: r.id } })}
          onDelete={(r) => {
            if (confirm(`Delete ${r.name}?`)) {
              BankRepo.remove(r.id);
              refresh();
            }
          }}
        />
      </div>
      <BankDialog open={open} onOpenChange={setOpen} bank={edit} onSaved={refresh} />
      <BankTxnDialog open={txnOpen} onOpenChange={setTxnOpen} accounts={rows} onSaved={refresh} />
    </div>
  );
}

function BankTxnDialog({
  open,
  onOpenChange,
  accounts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: BankAccount[];
  onSaved: () => void;
}) {
  const [bankId, setBankId] = useState("");
  const [type, setType] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [linkCash, setLinkCash] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setBankId(accounts[0]?.id ?? "");
      setType("deposit");
      setAmount("");
      setDate(today());
      setNotes("");
      setLinkCash(true);
      setSaving(false);
    }
  }, [open, accounts]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const n = parseFloat(amount) || 0;
    const bank = accounts.find((b) => b.id === bankId);
    if (!bank) {
      toast.error("Select a bank account");
      return;
    }
    if (n <= 0) {
      toast.error("Enter amount");
      return;
    }
    setSaving(true);
    BankTxnRepo.add({
      bankId: bank.id,
      date,
      type,
      amount: n,
      notes: notes.trim() || undefined,
    } as any);
    BankRepo.update(bank.id, {
      balance: Math.round((bank.balance + (type === "deposit" ? n : -n)) * 100) / 100,
    });
    if (linkCash) {
      // Deposit takes cash from the counter into the bank; withdrawal brings it back
      CashAdjustmentRepo.add({
        date,
        type: type === "deposit" ? "reduce" : "add",
        amount: n,
        reason: `Bank ${type} — ${bank.name}`,
      } as any);
    }
    toast.success(
      `${type === "deposit" ? "Deposited" : "Withdrawn"} ${fmtMoney(n)} ${type === "deposit" ? "to" : "from"} ${bank.name}`,
    );
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bank Deposit / Withdraw</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <label className="flex flex-col gap-1 text-[12px]">
            <span className="text-muted-foreground font-medium">Bank Account *</span>
            <select
              value={bankId}
              onChange={(e) => setBankId(e.target.value)}
              className="h-9 px-2 border rounded-md bg-background focus:border-primary outline-none"
            >
              {accounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} — {fmtMoney(b.balance)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType("deposit")}
              className={`flex-1 h-9 rounded-md border text-sm font-semibold transition inline-flex items-center justify-center gap-1.5 ${type === "deposit" ? "bg-success-soft text-success border-success" : "bg-background text-muted-foreground"}`}
            >
              <ArrowDownToLine className="h-3.5 w-3.5" /> Deposit
            </button>
            <button
              type="button"
              onClick={() => setType("withdraw")}
              className={`flex-1 h-9 rounded-md border text-sm font-semibold transition inline-flex items-center justify-center gap-1.5 ${type === "withdraw" ? "bg-destructive/10 text-destructive border-destructive" : "bg-background text-muted-foreground"}`}
            >
              <ArrowUpFromLine className="h-3.5 w-3.5" /> Withdraw
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
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reference, slip no…"
          />
          <label className="flex items-center gap-2 text-[13px] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={linkCash}
              onChange={(e) => setLinkCash(e.target.checked)}
              className="accent-primary"
            />
            <span>
              {type === "deposit"
                ? "Deposited from cash on hand (reduce counter cash)"
                : "Withdrawn to cash on hand (add counter cash)"}
            </span>
          </label>
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
              {saving ? "Saving…" : "Save Transaction"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BankDialog({
  open,
  onOpenChange,
  bank,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bank: BankAccount | null;
  onSaved: () => void;
}) {
  const firstRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState<Partial<BankAccount>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setF(bank ?? { openingBalance: 0, balance: 0 });
      setSaving(false);
      setTimeout(() => firstRef.current?.focus(), 50);
    }
  }, [open, bank]);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!f.name?.trim()) {
      toast.error("Name required");
      return;
    }
    setSaving(true);
    if (bank) BankRepo.update(bank.id, f as BankAccount);
    else
      BankRepo.add({
        ...f,
        name: f.name!,
        openingBalance: f.openingBalance ?? 0,
        balance: f.openingBalance ?? 0,
      } as any);
    toast.success("Saved");
    onSaved();
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{bank ? "Edit" : "New"} Bank Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field
              ref={firstRef}
              label="Bank Name *"
              value={f.name ?? ""}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </div>
          <Field
            label="Account Number"
            value={f.accountNumber ?? ""}
            onChange={(e) => setF({ ...f, accountNumber: e.target.value })}
          />
          <Field
            label="IFSC"
            value={f.ifsc ?? ""}
            onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase() })}
          />
          <NumField
            label="Opening Balance"
            value={f.openingBalance ?? 0}
            onValue={(n) => setF({ ...f, openingBalance: n })}
          />
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

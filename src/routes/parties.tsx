import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import {
  PartyRepo,
  SalesRepo,
  PurchaseRepo,
  SaleReturnRepo,
  PurchaseReturnRepo,
  PaymentRepo,
} from "@/repositories";
import type { Party } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/Field";
import { NumField } from "@/components/NumInput";
import { fmtMoney } from "@/lib/format";
import { partyBalances } from "@/lib/ledger";
import {
  Plus,
  Search,
  Pencil,
  FileText,
  Users,
  ArrowDownCircle,
  ArrowUpCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/parties")({ component: PartiesPage });

function PartiesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Party[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Party | null>(null);

  const refresh = () => setRows(PartyRepo.all());
  useEffect(refresh, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && !isTyping(e)) {
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
    return !s || r.name.toLowerCase().includes(s) || r.phone?.includes(s);
  });

  // Same per-party balance rules as the Dashboard/Customer-Supplier Ledger,
  // so this total always agrees with those pages.
  const customerBalances = partyBalances(
    SalesRepo.all(),
    SaleReturnRepo.all(),
    PaymentRepo.all().filter((p) => p.type === "in"),
    rows.filter((p) => p.type !== "supplier"),
    "customer",
  );
  const supplierBalances = partyBalances(
    PurchaseRepo.all(),
    PurchaseReturnRepo.all(),
    PaymentRepo.all().filter((p) => p.type === "out"),
    rows.filter((p) => p.type !== "customer"),
    "supplier",
  );
  const receivable = customerBalances.reduce((a, b) => a + Math.max(0, b.balance), 0);
  const payable = supplierBalances.reduce((a, b) => a + Math.max(0, b.balance), 0);

  const columns: Column<Party>[] = [
    {
      key: "name",
      label: "Name",
      render: (r) => <span className="font-medium">{r.name}</span>,
      sortValue: (r) => r.name,
    },
    { key: "phone", label: "Phone", width: "160px", render: (r) => r.phone ?? "—" },
    {
      key: "balance",
      label: "Opening Balance",
      align: "right",
      width: "150px",
      render: (r) => fmtMoney(r.openingBalance),
      sortValue: (r) => r.openingBalance,
    },
    {
      key: "credit",
      label: "Credit Limit",
      align: "right",
      width: "130px",
      render: (r) => (r.creditLimit ? fmtMoney(r.creditLimit) : "—"),
    },
    {
      key: "actions",
      label: "Action",
      width: "90px",
      align: "center",
      render: (r) => (
        <span className="inline-flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate({ to: "/parties/$id", params: { id: r.id } });
            }}
            className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"
            title="View statement"
          >
            <FileText className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEdit(r);
              setOpen(true);
            }}
            className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"
            title="Edit party"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Parties"
        subtitle={`${rows.length} customers / suppliers`}
        icon={<Users className="h-5 w-5" />}
        actions={
          <>
            <PartyCard icon={ArrowDownCircle} label="Total Receivable" value={receivable} tone="emerald" />
            <PartyCard icon={ArrowUpCircle} label="Total Payable" value={payable} tone="rose" />
            <div className="relative w-44 lg:w-56">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                placeholder="Search parties..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full h-8 pl-8 pr-3 border border-gray-200 rounded-md text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <Button
              size="sm"
              onClick={() => {
                setEdit(null);
                setOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> New Party <kbd className="text-[10px] ml-1">N</kbd>
            </Button>
          </>
        }
      />
      <div className="p-3 flex-1 min-h-0 flex">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          onRowActivate={(r) => navigate({ to: "/parties/$id", params: { id: r.id } })}
          onDelete={(r) => {
            // A party with any history must never be removable — old
            // invoices/payments would keep referencing a partyId that
            // resolves to nothing, making their statement/edit/reminder
            // permanently inaccessible while dashboard totals still count them.
            const hasHistory =
              SalesRepo.all().some((i) => i.partyId === r.id) ||
              PurchaseRepo.all().some((i) => i.partyId === r.id) ||
              SaleReturnRepo.all().some((i) => i.partyId === r.id) ||
              PurchaseReturnRepo.all().some((i) => i.partyId === r.id) ||
              PaymentRepo.all().some((i) => i.partyId === r.id);
            if (hasHistory) {
              toast.error(
                `Cannot delete ${r.name} — it has invoices, returns, or payments on record`,
              );
              return;
            }
            if (confirm(`Delete ${r.name}?`)) {
              PartyRepo.remove(r.id);
              refresh();
              toast.success("Party deleted");
            }
          }}
        />
      </div>
      <PartyDialog
        open={open}
        onOpenChange={setOpen}
        party={edit}
        onSaved={() => {
          refresh();
        }}
      />
    </div>
  );
}

export function PartyDialog({
  open,
  onOpenChange,
  party,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  party: Party | null;
  onSaved: () => void;
}) {
  const firstRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Partial<Party>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(party ?? { type: "both", openingBalance: 0 });
      setSaving(false);
      setTimeout(() => firstRef.current?.focus(), 50);
    }
  }, [open, party]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    // Repeat parties cannot be added — block duplicate names (case/spacing
    // insensitive) so "ABC" and "abc " don't end up as two separate parties.
    const dup = PartyRepo.all().find(
      (p) => p.name.trim().toLowerCase() === form.name!.trim().toLowerCase() && p.id !== party?.id,
    );
    if (dup) {
      toast.error(`Party "${dup.name}" already exists — repeat parties cannot be added`);
      return;
    }
    setSaving(true);
    if (party) {
      PartyRepo.update(party.id, form as Party);
      toast.success("Party updated");
    } else {
      PartyRepo.add({
        ...form,
        name: form.name!,
        type: "both",
        openingBalance: form.openingBalance ?? 0,
      } as any);
      toast.success("Party created");
    }
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") onOpenChange(false);
        }}
      >
        <DialogHeader>
          <DialogTitle>{party ? "Edit Party" : "New Party"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            ref={firstRef}
            label="Name *"
            value={form.name ?? ""}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Field
            label="Phone"
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <NumField
            label="Opening Balance (+ they owe you, − you owe them)"
            value={form.openingBalance ?? 0}
            onValue={(n) => setForm({ ...form, openingBalance: n })}
            allowNegative
          />
          <Field
            label="Credit Limit"
            type="number"
            value={form.creditLimit ?? ""}
            onChange={(e) =>
              setForm({ ...form, creditLimit: parseFloat(e.target.value) || undefined })
            }
          />
          <div className="col-span-2 flex justify-end gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel <kbd className="ml-1 text-[10px]">Esc</kbd>
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

const PARTY_TONES = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  rose: { bg: "bg-rose-50", text: "text-rose-600" },
  primary: { bg: "bg-primary-soft", text: "text-primary" },
} as const;

function PartyCard({
  icon: Icon,
  label,
  value,
  tone,
  isCount,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: keyof typeof PARTY_TONES;
  isCount?: boolean;
}) {
  const t = PARTY_TONES[tone];
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
          {isCount ? value : fmtMoney(value)}
        </p>
      </div>
    </div>
  );
}

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement;
  return (
    el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable)
  );
}

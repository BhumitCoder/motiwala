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
import { Plus, Search, Pencil, FileText, Users, AlertTriangle } from "lucide-react";
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
  const receivableByParty = new Map(customerBalances.map((b) => [b.partyId, Math.max(0, b.balance)]));
  const payableByParty = new Map(supplierBalances.map((b) => [b.partyId, Math.max(0, b.balance)]));

  const columns: Column<Party>[] = [
    {
      key: "name",
      label: "Name",
      render: (r) => r.name,
      sortValue: (r) => r.name,
    },
    { key: "phone", label: "Phone", width: "160px", render: (r) => r.phone ?? "—" },
    {
      key: "receivable",
      label: "Receivable",
      align: "right",
      width: "130px",
      render: (r) => {
        const v = receivableByParty.get(r.id) ?? 0;
        return v > 0 ? <span className="tabular-nums">{fmtMoney(v)}</span> : "—";
      },
      sortValue: (r) => receivableByParty.get(r.id) ?? 0,
    },
    {
      key: "payable",
      label: "Payable",
      align: "right",
      width: "130px",
      render: (r) => {
        const v = payableByParty.get(r.id) ?? 0;
        return v > 0 ? <span className="tabular-nums">{fmtMoney(v)}</span> : "—";
      },
      sortValue: (r) => payableByParty.get(r.id) ?? 0,
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
              <Plus className="h-3.5 w-3.5" /> New Party
            </Button>
          </>
        }
      />
      <div className="p-6 flex-1 min-h-0 flex">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          footer={
            <tr>
              <td colSpan={2}>Total ({filtered.length} parties)</td>
              <td className="text-right tabular-nums">{fmtMoney(receivable)}</td>
              <td className="text-right tabular-nums">{fmtMoney(payable)}</td>
              <td colSpan={2} />
            </tr>
          }
          activateOnClick
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
  const [nameOpen, setNameOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(party ?? { type: "both", openingBalance: 0 });
      setSaving(false);
      setNameOpen(false);
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

  // Live "does this already exist?" hint — the exact-match case is hard
  // blocked on save, but a near-match (extra word, different spacing) isn't
  // an error, just something the client asked to be warned about before
  // they commit to a possible duplicate.
  const nameQ = (form.name ?? "").trim().toLowerCase();
  const similarPartiesAll = nameQ
    ? PartyRepo.all().filter((p) => p.id !== party?.id && p.name.trim().toLowerCase().includes(nameQ))
    : [];
  const similarParties = similarPartiesAll.slice(0, 5);

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
          <div className="relative">
            <Field
              ref={firstRef}
              label="Name *"
              value={form.name ?? ""}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                setNameOpen(true);
              }}
              onFocus={() => setNameOpen(true)}
              onBlur={() => setTimeout(() => setNameOpen(false), 150)}
              autoComplete="off"
            />
            {nameOpen && similarParties.length > 0 && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 border rounded-md bg-popover shadow-elevated max-h-52 overflow-auto">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-50 border-b flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" />
                  {similarPartiesAll.length === 1 ? "Similar party exists" : "Similar parties exist"}
                  — check before saving
                </div>
                {similarParties.map((p) => (
                  <div key={p.id} className="px-3 py-2 text-sm flex items-center justify-between">
                    <span className="font-medium">{p.name}</span>
                    {p.phone && <span className="text-[11px] text-muted-foreground">{p.phone}</span>}
                  </div>
                ))}
                {similarPartiesAll.length > similarParties.length && (
                  <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t">
                    +{similarPartiesAll.length - similarParties.length} more match
                    {similarPartiesAll.length - similarParties.length > 1 ? "es" : ""}
                  </div>
                )}
              </div>
            )}
          </div>
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

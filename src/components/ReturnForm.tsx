import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/Field";
import {
  PartyRepo,
  ItemRepo,
  SaleReturnRepo,
  PurchaseReturnRepo,
  CompanyRepo,
  nextInvoiceNumber,
  SalesRepo,
  PurchaseRepo,
} from "@/repositories";
import type { Return, LineItem, Party, Item, Invoice } from "@/types";
import { fmtMoney, today } from "@/lib/format";
import { toast } from "sonner";
import { Trash2, UserPlus, Save, X, CornerDownLeft, CornerUpLeft, Loader2 } from "lucide-react";
import { genId } from "@/repositories/base";

interface Props {
  mode: "sale-return" | "purchase-return";
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function ReturnForm({ mode }: Props) {
  const navigate = useNavigate();
  const company = CompanyRepo.get();
  const isSaleReturn = mode === "sale-return";
  const repo = isSaleReturn ? SaleReturnRepo : PurchaseReturnRepo;
  const prefix = isSaleReturn
    ? company.invoicePrefix.replace("INV-", "CR-") || "CR-"
    : company.purchasePrefix.replace("PUR-", "DR-") || "DR-";
  const backPath = isSaleReturn ? "/sale-return" : "/purchase-return";

  const [ret, setRet] = useState<Return>(() => ({
    id: "",
    number: nextInvoiceNumber(prefix, repo.all()),
    date: today(),
    originalRef: "",
    partyId: "",
    partyName: "",
    partyPhone: "",
    gstEnabled: company.enableGst !== false,
    lineItems: [],
    subtotal: 0,
    taxAmount: 0,
    total: 0,
    notes: "",
    createdAt: "",
  }));

  const gstOn = ret.gstEnabled !== false;
  const [allParties] = useState(() => PartyRepo.all());
  const items = useMemo(() => ItemRepo.all(), []);
  const partyRef = useRef<HTMLInputElement>(null);
  const [partyQ, setPartyQ] = useState("");
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyIdx, setPartyIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // "Return against invoice": search the original bill and auto-load its items
  const [invQ, setInvQ] = useState("");
  const [invOpen, setInvOpen] = useState(false);
  const [invIdx, setInvIdx] = useState(0);
  const invoiceRepo = isSaleReturn ? SalesRepo : PurchaseRepo;

  const invSuggests = useMemo(() => {
    const q = invQ.trim().toLowerCase();
    if (!q) return [];
    return invoiceRepo
      .all()
      .filter((i) => i.number.toLowerCase().includes(q) || i.partyName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [invQ, invoiceRepo]);

  const loadFromInvoice = (inv: Invoice) => {
    const lines = inv.lineItems.map((l) => ({ ...l, id: genId() }));
    const gst = inv.gstEnabled !== false;
    setRet({
      ...ret,
      originalRef: inv.number,
      partyId: inv.partyId,
      partyName: inv.partyName,
      partyPhone: inv.partyPhone,
      gstEnabled: inv.gstEnabled,
      lineItems: lines,
      ...recalc(lines, gst),
    });
    setPartyQ(inv.partyName);
    setInvQ(inv.number);
    setInvOpen(false);
    toast.success(
      `Loaded ${lines.length} item${lines.length > 1 ? "s" : ""} from ${inv.number} — remove items or adjust qty to what actually came back`,
    );
  };

  const partySuggests = useMemo(() => {
    const q = partyQ.trim().toLowerCase();
    if (!q) return [];
    return allParties.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [partyQ, allParties]);

  useEffect(() => {
    partyRef.current?.focus();
  }, []);

  const recalc = (lines: LineItem[], gst = gstOn) => {
    const subtotal = r2(lines.reduce((s, l) => s + l.qty * l.price, 0));
    const afterDisc = r2(
      lines.reduce((s, l) => s + r2(l.qty * l.price * (1 - l.discountPct / 100)), 0),
    );
    const taxAmount = gst
      ? r2(
          lines.reduce(
            (s, l) => s + r2(r2(l.qty * l.price * (1 - l.discountPct / 100)) * (l.gstRate / 100)),
            0,
          ),
        )
      : 0;
    const total = r2(afterDisc + taxAmount);
    return { subtotal, taxAmount, total };
  };

  const selectParty = (p: Party) => {
    setRet({ ...ret, partyId: p.id, partyName: p.name, partyPhone: p.phone ?? "" });
    setPartyQ(p.name);
    setPartyOpen(false);
  };

  const addLineItem = (it: Item) => {
    const line: LineItem = {
      id: genId(),
      itemId: it.id,
      name: it.name,
      qty: 1,
      unit: it.unit,
      price: isSaleReturn ? it.salePrice : it.purchasePrice,
      discountPct: 0,
      gstRate: it.gstRate,
      amount: 0,
      costPrice: it.purchasePrice,
    };
    const gstMult = gstOn ? 1 + line.gstRate / 100 : 1;
    line.amount = r2(r2(line.qty * line.price) * gstMult);
    const lines = [...ret.lineItems, line];
    setRet({ ...ret, lineItems: lines, ...recalc(lines) });
  };

  const updateLine = (id: string, patch: Partial<LineItem>) => {
    const lines = ret.lineItems.map((l) => {
      if (l.id !== id) return l;
      const nl = { ...l, ...patch };
      const gstMult = gstOn ? 1 + nl.gstRate / 100 : 1;
      nl.amount = r2(r2(nl.qty * nl.price * (1 - nl.discountPct / 100)) * gstMult);
      return nl;
    });
    setRet({ ...ret, lineItems: lines, ...recalc(lines) });
  };

  const removeLine = (id: string) => {
    const lines = ret.lineItems.filter((l) => l.id !== id);
    setRet({ ...ret, lineItems: lines, ...recalc(lines) });
  };

  const toggleGst = () => {
    const newGst = !gstOn;
    const lines = ret.lineItems.map((l) => {
      const gstMult = newGst ? 1 + l.gstRate / 100 : 1;
      return { ...l, amount: r2(r2(l.qty * l.price * (1 - l.discountPct / 100)) * gstMult) };
    });
    setRet({ ...ret, gstEnabled: newGst, lineItems: lines, ...recalc(lines, newGst) });
  };

  const save = () => {
    if (savingRef.current) return; // double-click protection
    let partyId = ret.partyId;
    let partyName = ret.partyName || partyQ.trim();
    if (!partyId && !partyName) {
      toast.error("Enter party name");
      partyRef.current?.focus();
      return;
    }
    if (!ret.lineItems.length) {
      toast.error("Add at least one item");
      return;
    }
    const badLine = ret.lineItems.find((l) => !(l.qty > 0) || l.price < 0);
    if (badLine) {
      toast.error(`Check quantity/price for "${badLine.name}" — qty must be more than 0`);
      return;
    }
    savingRef.current = true;
    setSaving(true);

    if (!partyId) {
      const match = allParties.find((p) => p.name.toLowerCase() === partyName.toLowerCase());
      if (match) {
        partyId = match.id;
        partyName = match.name;
      } else {
        const np: Party = {
          id: genId(),
          name: partyName,
          type: "both",
          openingBalance: 0,
          createdAt: new Date().toISOString(),
        };
        PartyRepo.add(np);
        partyId = np.id;
        toast.success(`New party added: ${partyName}`);
      }
    }

    const finalRet: Return = { ...ret, partyId, partyName, createdAt: new Date().toISOString() };

    // Sale Return → items come BACK to stock (+qty)
    // Purchase Return → items GO BACK to supplier (-qty)
    const stockDelta = isSaleReturn ? 1 : -1;
    for (const l of finalRet.lineItems) {
      const it = ItemRepo.get(l.itemId);
      if (it) ItemRepo.adjustField(it.id, "stock", stockDelta * l.qty);
    }

    repo.add(finalRet as any);
    toast.success(`${isSaleReturn ? "Sale Return" : "Purchase Return"} saved`);
    navigate({ to: backPath });
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") navigate({ to: backPath });
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b bg-card flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md flex items-center justify-center bg-primary-soft text-primary">
            {isSaleReturn ? (
              <CornerDownLeft className="h-5 w-5" />
            ) : (
              <CornerUpLeft className="h-5 w-5" />
            )}
          </div>
          <div>
            <h1 className="text-[17px] font-bold tracking-tight">
              New {isSaleReturn ? "Sale Return" : "Purchase Return"}
            </h1>
            <p className="text-[11px] text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">{ret.number}</span> · Ctrl+S
              save · Esc cancel
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 h-9 px-3 rounded-md border bg-background cursor-pointer select-none">
            <input
              type="checkbox"
              checked={gstOn}
              onChange={toggleGst}
              className="accent-primary"
            />
            <span className="text-[12px] font-semibold">GST</span>
          </label>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: backPath })}>
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving…" : "Save"}
            {!saving && <kbd className="ml-1 text-[10px] opacity-80">Ctrl+S</kbd>}
          </Button>
        </div>
      </div>

      <div className="p-5 space-y-4 overflow-auto flex-1 bg-muted/30">
        {/* Party & Meta */}
        <div className="bg-card border rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isSaleReturn ? "Customer Details" : "Supplier Details"}
            </span>
            {ret.partyId && (
              <span className="text-[11px] text-success font-medium bg-success-soft px-2 py-0.5 rounded">
                ✓ Existing party
              </span>
            )}
            {!ret.partyId && partyQ && (
              <span className="text-[11px] text-primary font-medium bg-primary-soft px-2 py-0.5 rounded flex items-center gap-1">
                <UserPlus className="h-3 w-3" /> Will auto-create on save
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative lg:col-span-2">
              <label className="flex flex-col gap-1 text-[12px]">
                <span className="text-muted-foreground font-medium">
                  {isSaleReturn ? "Customer" : "Supplier"} Name *
                </span>
                <input
                  ref={partyRef}
                  value={partyQ}
                  onChange={(e) => {
                    setPartyQ(e.target.value);
                    setPartyOpen(true);
                    setPartyIdx(0);
                    if (ret.partyId) setRet({ ...ret, partyId: "", partyName: e.target.value });
                  }}
                  onFocus={() => setPartyOpen(true)}
                  onBlur={() => setTimeout(() => setPartyOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setPartyIdx((i) => Math.min(partySuggests.length - 1, i + 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setPartyIdx((i) => Math.max(0, i - 1));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (partySuggests[partyIdx]) selectParty(partySuggests[partyIdx]);
                    }
                  }}
                  className="h-9 px-3 border rounded-md bg-background focus:border-primary focus:ring-2 focus:ring-ring/20 outline-none"
                  placeholder="Type name or search…"
                />
              </label>
              {partyOpen && partySuggests.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 border rounded-md bg-popover shadow-lg max-h-48 overflow-auto">
                  {partySuggests.map((p, i) => (
                    <div
                      key={p.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectParty(p);
                      }}
                      className={`px-3 py-2 text-sm cursor-pointer ${i === partyIdx ? "bg-accent" : "hover:bg-accent"}`}
                    >
                      <div className="font-semibold">{p.name}</div>
                      {p.phone && (
                        <div className="text-[11px] text-muted-foreground">📞 {p.phone}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Field
              label="Return Date"
              type="date"
              value={ret.date}
              onChange={(e) => setRet({ ...ret, date: e.target.value })}
            />
            <div className="relative">
              <label className="flex flex-col gap-1 text-[12px]">
                <span className="text-muted-foreground font-medium">
                  Original {isSaleReturn ? "Invoice" : "Bill"} #
                </span>
                <input
                  value={invQ}
                  onChange={(e) => {
                    setInvQ(e.target.value);
                    setRet({ ...ret, originalRef: e.target.value });
                    setInvOpen(true);
                    setInvIdx(0);
                  }}
                  onFocus={() => invQ && setInvOpen(true)}
                  onBlur={() => setTimeout(() => setInvOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setInvIdx((i) => Math.min(invSuggests.length - 1, i + 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setInvIdx((i) => Math.max(0, i - 1));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (invSuggests[invIdx]) loadFromInvoice(invSuggests[invIdx]);
                    }
                  }}
                  className="h-9 px-3 border rounded-md bg-background focus:border-primary focus:ring-2 focus:ring-ring/20 outline-none"
                  placeholder={`Search ${isSaleReturn ? "INV-…" : "PUR-…"} to auto-load items`}
                />
              </label>
              {invOpen && invSuggests.length > 0 && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1 border rounded-md bg-popover shadow-lg max-h-56 overflow-auto">
                  {invSuggests.map((i, idx) => (
                    <div
                      key={i.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        loadFromInvoice(i);
                      }}
                      className={`px-3 py-2 text-sm cursor-pointer ${idx === invIdx ? "bg-accent" : "hover:bg-accent"}`}
                    >
                      <div className="flex justify-between">
                        <span className="font-mono font-semibold text-xs text-primary">
                          {i.number}
                        </span>
                        <span className="font-semibold tabular-nums">{fmtMoney(i.total)}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {i.partyName} · {i.lineItems.length} items · {i.date}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-muted/50 flex items-center justify-between">
            <span className="text-[13px] font-semibold">
              Returned Items ({ret.lineItems.length})
            </span>
            <span className="text-[11px] text-muted-foreground">Type to search & add items</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[640px]">
              <thead className="text-[11px] text-muted-foreground uppercase tracking-wider">
                <tr className="bg-muted/40">
                  <th className="text-left px-3 py-2 w-8">#</th>
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-right w-20 py-2">Qty</th>
                  <th className="text-left w-16 py-2">Unit</th>
                  <th className="text-right w-24 py-2">Price</th>
                  <th className="text-right w-20 py-2">Disc%</th>
                  {gstOn && <th className="text-right w-20 py-2">GST%</th>}
                  <th className="text-right w-28 py-2 pr-3">Amount</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {ret.lineItems.map((l, idx) => (
                  <tr key={l.id} className="border-t hover:bg-accent/30">
                    <td className="px-3 py-1.5 text-muted-foreground text-[11px]">{idx + 1}</td>
                    <td className="px-3 py-1.5 font-medium">{l.name}</td>
                    <td className="py-1.5">
                      <input
                        type="number"
                        value={l.qty}
                        min={0}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => updateLine(l.id, { qty: parseFloat(e.target.value) || 0 })}
                        className="w-full h-7 px-1.5 text-right border rounded bg-background focus:border-primary outline-none"
                      />
                    </td>
                    <td className="py-1.5">
                      <input
                        value={l.unit}
                        onChange={(e) => updateLine(l.id, { unit: e.target.value })}
                        className="w-full h-7 px-1.5 border rounded bg-background focus:border-primary outline-none"
                      />
                    </td>
                    <td className="py-1.5">
                      <input
                        type="number"
                        value={l.price}
                        min={0}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) =>
                          updateLine(l.id, { price: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full h-7 px-1.5 text-right border rounded bg-background focus:border-primary outline-none"
                      />
                    </td>
                    <td className="py-1.5">
                      <input
                        type="number"
                        value={l.discountPct}
                        min={0}
                        max={100}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) =>
                          updateLine(l.id, { discountPct: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full h-7 px-1.5 text-right border rounded bg-background focus:border-primary outline-none"
                      />
                    </td>
                    {gstOn && (
                      <td className="py-1.5">
                        <input
                          type="number"
                          value={l.gstRate}
                          min={0}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) =>
                            updateLine(l.id, { gstRate: parseFloat(e.target.value) || 0 })
                          }
                          className="w-full h-7 px-1.5 text-right border rounded bg-background focus:border-primary outline-none"
                        />
                      </td>
                    )}
                    <td className="text-right px-3 py-1.5 font-semibold tabular-nums">
                      {fmtMoney(l.amount)}
                    </td>
                    <td className="py-1.5">
                      <button
                        type="button"
                        onClick={() => removeLine(l.id)}
                        className="text-destructive p-1 hover:bg-destructive/10 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                <ReturnItemPickerRow items={items} onAdd={addLineItem} gstOn={gstOn} />
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals + Notes */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border rounded-lg shadow-sm p-4">
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-muted-foreground font-medium uppercase text-[11px] tracking-wider">
                Notes
              </span>
              <textarea
                value={ret.notes ?? ""}
                onChange={(e) => setRet({ ...ret, notes: e.target.value })}
                placeholder="Reason for return, condition of goods…"
                className="min-h-[80px] px-3 py-2 border rounded-md bg-background focus:border-primary outline-none"
              />
            </label>
          </div>
          <div className="border rounded-lg bg-card shadow-sm p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{fmtMoney(ret.subtotal)}</span>
            </div>
            {gstOn && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax (GST)</span>
                <span className="tabular-nums">{fmtMoney(ret.taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 mt-1 border-t font-bold text-lg">
              <span>{isSaleReturn ? "Credit Note" : "Debit Note"} Total</span>
              <span className="tabular-nums text-warning">{fmtMoney(ret.total)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground pt-1">
              Stock will be {isSaleReturn ? "increased" : "decreased"} on save
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReturnItemPickerRow({
  items,
  onAdd,
  gstOn,
}: {
  items: Item[];
  onAdd: (i: Item) => void;
  gstOn: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggests = items
    .filter(
      (i) =>
        i.name.toLowerCase().includes(q.toLowerCase()) ||
        i.sku?.toLowerCase().includes(q.toLowerCase()) ||
        i.barcode?.includes(q),
    )
    .slice(0, 8);

  const pick = (it: Item) => {
    onAdd(it);
    setQ("");
    setOpen(false);
    setTimeout(() => inputRef.current?.focus(), 30);
  };
  const colSpan = gstOn ? 9 : 8;

  return (
    <tr className="border-t bg-primary-soft/30">
      <td colSpan={colSpan} className="p-2 relative">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setIdx(0);
          }}
          onFocus={() => q && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(suggests.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (suggests[idx]) pick(suggests[idx]);
            }
          }}
          placeholder="🔍  Search item to add for return…"
          className="w-full h-8 px-3 bg-transparent outline-none text-[13px] placeholder:text-muted-foreground"
        />
        {open && suggests.length > 0 && (
          <div className="absolute z-30 top-full left-2 right-2 mt-1 border rounded-md bg-popover shadow-lg max-h-48 overflow-auto">
            {suggests.map((it, i) => (
              <div
                key={it.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(it);
                }}
                className={`px-3 py-2 cursor-pointer flex justify-between items-center ${i === idx ? "bg-accent" : "hover:bg-accent"}`}
              >
                <div>
                  <span className="font-medium">{it.name}</span>
                  {it.sku && (
                    <span className="text-[11px] text-muted-foreground ml-2">{it.sku}</span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Stock: {it.stock} {it.unit}
                </span>
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

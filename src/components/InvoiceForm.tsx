import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/Field";
import {
  PartyRepo,
  ItemRepo,
  SalesRepo,
  PurchaseRepo,
  CompanyRepo,
  nextInvoiceNumber,
  SaleReturnRepo,
  PurchaseReturnRepo,
  PaymentRepo,
} from "@/repositories";
import { partyBalances } from "@/lib/ledger";
import type { Invoice, LineItem, Party, Item, PaymentMode } from "@/types";
import { fmtMoney, today } from "@/lib/format";
import { toast } from "sonner";
import {
  Trash2,
  UserPlus,
  Save,
  X,
  Printer,
  FileText,
  Receipt,
  Pencil,
  Check,
  Loader2,
} from "lucide-react";
import { PrintableInvoice } from "@/components/PrintableInvoice";
import { NumInput } from "@/components/NumInput";
import { ModePills } from "@/components/ModePills";
import { genId, newBatch, commitBatch } from "@/repositories/base";

interface Props {
  mode: "sale" | "purchase";
  existing?: Invoice | null;
}

export function InvoiceForm({ mode, existing }: Props) {
  const navigate = useNavigate();
  const company = CompanyRepo.get();
  const isSale = mode === "sale";
  const repo = isSale ? SalesRepo : PurchaseRepo;
  const partyFilter = (_p: Party) => true;

  const [inv, setInv] = useState<Invoice>(
    () =>
      existing ?? {
        id: "",
        number: nextInvoiceNumber(
          isSale ? company.invoicePrefix : company.purchasePrefix,
          repo.all(),
        ),
        date: today(),
        partyId: "",
        partyName: "",
        partyPhone: "",
        gstEnabled: company.enableGst !== false,
        lineItems: [],
        subtotal: 0,
        discount: 0,
        taxAmount: 0,
        total: 0,
        paid: 0,
        paymentMode: "cash",
        createdAt: "",
        notes: "",
      },
  );

  const gstOn = inv.gstEnabled !== false;

  const [allParties, setAllParties] = useState(() => PartyRepo.all());
  const parties = useMemo(() => allParties.filter(partyFilter), [allParties]);
  const [items, setItems] = useState(() => ItemRepo.all());
  const partyRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const [partyQ, setPartyQ] = useState(existing?.partyName ?? "");
  const [phoneQ, setPhoneQ] = useState(existing?.partyPhone ?? "");
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyIdx, setPartyIdx] = useState(0);
  const [numberEditing, setNumberEditing] = useState(false);
  const numberRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Live outstanding balance of the selected party (credit decision at the counter)
  const partyBalance = useMemo(() => {
    if (!inv.partyId) return null;
    const list = partyBalances(
      isSale ? SalesRepo.all() : PurchaseRepo.all(),
      isSale ? SaleReturnRepo.all() : PurchaseReturnRepo.all(),
      PaymentRepo.all().filter((p) => p.type === (isSale ? "in" : "out")),
      allParties.filter((p) => (isSale ? p.type !== "supplier" : p.type !== "customer")),
      isSale ? "customer" : "supplier",
    );
    return list.find((b) => b.partyId === inv.partyId)?.balance ?? 0;
  }, [inv.partyId, isSale]);

  const partySuggests = useMemo(() => {
    const q = partyQ.trim().toLowerCase();
    const pq = phoneQ.trim();
    if (!q && !pq) return [];
    return parties
      .filter(
        (p) => (q && p.name.toLowerCase().includes(q)) || (pq && (p.phone ?? "").includes(pq)),
      )
      .slice(0, 8);
  }, [partyQ, phoneQ, parties]);

  useEffect(() => {
    partyRef.current?.focus();
  }, []);

  const r2 = (n: number) => Math.round(n * 100) / 100;

  const roundEnabled = company.enableRoundOff !== false;

  const recalc = (lines: LineItem[], discount = inv.discount, gst = gstOn) => {
    const subtotal = r2(lines.reduce((s, l) => s + l.qty * l.price, 0));
    const afterLineDisc = r2(
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
    const rawTotal = Math.max(0, r2(afterLineDisc + taxAmount - discount));
    // Indian billing convention: round to the nearest whole rupee
    const total = roundEnabled ? Math.round(rawTotal) : rawTotal;
    const roundOff = r2(total - rawTotal);
    return { subtotal, taxAmount, total, roundOff };
  };

  const selectParty = (p: Party) => {
    setInv({ ...inv, partyId: p.id, partyName: p.name, partyPhone: p.phone ?? "" });
    setPartyQ(p.name);
    setPhoneQ(p.phone ?? "");
    setPartyOpen(false);
    setTimeout(() => document.getElementById("inv-date")?.focus(), 30);
  };

  const clearParty = () => {
    setInv({ ...inv, partyId: "", partyName: "", partyPhone: "" });
    setPartyQ("");
    setPhoneQ("");
    setTimeout(() => partyRef.current?.focus(), 30);
  };

  const addLineItem = (it: Item) => {
    // Repeat items cannot be added twice — increase quantity of the existing line instead
    const existingLine = inv.lineItems.find((l) => l.itemId === it.id);
    if (existingLine) {
      updateLine(existingLine.id, { qty: existingLine.qty + 1 });
      toast.info(`${it.name} — quantity increased to ${existingLine.qty + 1}`);
      return;
    }
    const line: LineItem = {
      id: genId(),
      itemId: it.id,
      name: it.name,
      qty: 1,
      unit: it.unit,
      price: isSale ? it.salePrice || it.purchasePrice : it.purchasePrice,
      discountPct: 0,
      gstRate: it.gstRate,
      amount: 0,
      costPrice: it.purchasePrice,
    };
    const gstMult = gstOn ? 1 + line.gstRate / 100 : 1;
    line.amount = r2(r2(line.qty * line.price * (1 - line.discountPct / 100)) * gstMult);
    const lines = [...inv.lineItems, line];
    setInv({ ...inv, lineItems: lines, ...recalc(lines) });
  };

  // Type any name in the item search — if it doesn't exist yet, it is created
  // automatically so price & quantity can be entered right here in the bill
  const addNewItemByName = (name: string) => {
    const existing = items.find((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) {
      addLineItem(existing);
      return;
    }
    const newItem = ItemRepo.add({
      name: name.trim(),
      unit: "pcs",
      gstRate: 0,
      purchasePrice: 0,
      salePrice: 0,
      stock: 0,
      openingStock: 0,
    }) as Item;
    setItems(ItemRepo.all());
    addLineItem(newItem);
    toast.success(`New item added: ${newItem.name} — enter price & qty in the row`);
  };

  const updateLine = (id: string, patch: Partial<LineItem>) => {
    const lines = inv.lineItems.map((l) => {
      if (l.id !== id) return l;
      const nl = { ...l, ...patch };
      // Clamp so a mistyped discount (e.g. 500 instead of 50) or a negative
      // GST rate can never flip the line amount negative.
      nl.discountPct = Math.min(100, Math.max(0, nl.discountPct));
      nl.gstRate = Math.max(0, nl.gstRate);
      const gstMult = gstOn ? 1 + nl.gstRate / 100 : 1;
      nl.amount = r2(r2(nl.qty * nl.price * (1 - nl.discountPct / 100)) * gstMult);
      return nl;
    });
    setInv({ ...inv, lineItems: lines, ...recalc(lines) });
  };

  const removeLine = (id: string) => {
    const lines = inv.lineItems.filter((l) => l.id !== id);
    setInv({ ...inv, lineItems: lines, ...recalc(lines) });
  };

  const setDiscount = (d: number) => setInv({ ...inv, discount: d, ...recalc(inv.lineItems, d) });

  const toggleGst = () => {
    const newGst = !gstOn;
    const lines = inv.lineItems.map((l) => {
      const gstMult = newGst ? 1 + l.gstRate / 100 : 1;
      return { ...l, amount: r2(r2(l.qty * l.price * (1 - l.discountPct / 100)) * gstMult) };
    });
    setInv({
      ...inv,
      gstEnabled: newGst,
      lineItems: lines,
      ...recalc(lines, inv.discount, newGst),
    });
  };

  const save = (andPrint = false) => {
    if (savingRef.current) return; // double-click / Ctrl+S repeat protection

    // ── Validations ─────────────────────────────────────────────
    if (!inv.lineItems.length) {
      toast.error("Add at least one item");
      return;
    }
    const badLine = inv.lineItems.find((l) => !(l.qty > 0) || l.price < 0);
    if (badLine) {
      toast.error(`Check quantity/price for "${badLine.name}" — qty must be more than 0`);
      return;
    }
    const number = inv.number.trim();
    if (!number) {
      toast.error(`${isSale ? "Invoice" : "Bill"} number is required`);
      return;
    }
    const dupNo = repo.all().find((i) => i.number.trim() === number && i.id !== existing?.id);
    if (dupNo) {
      toast.error(`${isSale ? "Invoice" : "Bill"} number ${number} is already used — change it`);
      setNumberEditing(true);
      setTimeout(() => numberRef.current?.focus(), 50);
      return;
    }
    // Paid can never exceed the bill total
    let paid = inv.paid;
    if (paid > inv.total) {
      paid = inv.total;
      toast.info(`Paid amount adjusted to bill total ${fmtMoney(inv.total)}`);
    }

    // Everything below must land together or not at all: the invoice write,
    // its stock adjustments, and any Payment re-allocation. A shared batch
    // commits them as one atomic Firestore write instead of independent
    // fire-and-forget calls that could partially fail and desync stock/money.
    const batch = newBatch();

    // Resolve or auto-create party
    let partyId = inv.partyId;
    let partyName = inv.partyName || partyQ.trim();
    const phone = phoneQ.trim();

    if (!partyId) {
      if (!partyName && !phone) {
        toast.error("Enter customer name or phone");
        partyRef.current?.focus();
        return;
      }
      // Try match by phone first (unique), then by name
      const byPhone = phone ? allParties.find((p) => (p.phone ?? "").trim() === phone) : null;
      const byName = partyName
        ? allParties.find((p) => p.name.toLowerCase() === partyName.toLowerCase())
        : null;
      const existingParty = byPhone ?? byName;

      if (existingParty) {
        partyId = existingParty.id;
        partyName = existingParty.name;
      } else {
        // Auto-create
        const newParty: Party = {
          id: genId(),
          name: partyName || `Party ${phone}`,
          type: "both",
          phone,
          openingBalance: 0,
          createdAt: new Date().toISOString(),
        };
        PartyRepo.addBatched(batch, newParty);
        setAllParties(PartyRepo.all());
        partyId = newParty.id;
        partyName = newParty.name;
        toast.success(`New party added: ${partyName}`);
      }
    }

    savingRef.current = true;
    setSaving(true);

    const finalInv: Invoice = { ...inv, number, paid, partyId, partyName, partyPhone: phone };

    // If editing dropped the settled amount (bill total reduced, or paid
    // lowered manually), Payment allocations tied to this invoice can now
    // exceed what's actually owed. Trim them so the freed money surfaces as
    // an advance instead of silently vanishing from ledger reports.
    // IMPORTANT: this runs AFTER every validation early-return (cache writes
    // land immediately), and the excess is recomputed from the LIVE
    // allocations — never from existing.paid — so a failed attempt or a
    // retry can never trim the same money twice.
    if (existing?.id) {
      const liveAllocated = r2(
        PaymentRepo.all().reduce(
          (s, p) =>
            s +
            (p.allocations ?? [])
              .filter((a) => a.invoiceId === existing.id)
              .reduce((x, a) => x + a.amount, 0),
          0,
        ),
      );
      let excess = r2(liveAllocated - paid);
      for (const p of PaymentRepo.all()) {
        if (excess <= 0) break;
        const alloc = p.allocations?.find((a) => a.invoiceId === existing.id);
        if (!alloc) continue;
        const reduceBy = Math.min(alloc.amount, excess);
        const remaining = p
          .allocations!.map((a) =>
            a.invoiceId === existing.id ? { ...a, amount: r2(a.amount - reduceBy) } : a,
          )
          .filter((a) => a.amount > 0);
        PaymentRepo.updateBatched(batch, p.id, {
          allocations: remaining.length ? remaining : undefined,
        });
        excess = r2(excess - reduceBy);
      }
    }

    if (existing?.id) {
      // Reverse original stock before applying new quantities (atomic increments)
      const origDelta = isSale ? 1 : -1;
      for (const l of existing.lineItems) {
        const it = ItemRepo.get(l.itemId);
        if (it) ItemRepo.adjustFieldBatched(batch, it.id, "stock", origDelta * l.qty);
      }
    }

    const stockDelta = isSale ? -1 : 1;
    for (const l of finalInv.lineItems) {
      const it = ItemRepo.get(l.itemId);
      if (!it) continue;
      const extra: Partial<Item> = {};
      if (l.price > 0) {
        // Sale price: only fill in when empty (bills often have per-customer discounts)
        if (isSale && !it.salePrice) extra.salePrice = l.price;
        // Purchase price: always track the LATEST cost so profit stays accurate
        if (!isSale && it.purchasePrice !== l.price) extra.purchasePrice = l.price;
      }
      ItemRepo.adjustFieldBatched(batch, it.id, "stock", stockDelta * l.qty, extra);
    }

    // Warn (non-blocking) when a sale pushes stock below zero — shop can still bill
    if (isSale) {
      const negative = finalInv.lineItems
        .map((l) => ItemRepo.get(l.itemId))
        .filter((it): it is Item => !!it && it.stock < 0);
      if (negative.length) {
        toast.warning(
          `Stock below zero: ${negative.map((i) => i.name).join(", ")} — add purchase entry`,
        );
      }
      // Credit limit alert for credit sales
      const party = PartyRepo.get(partyId);
      if (party?.creditLimit && partyBalance !== null) {
        const newBalance =
          partyBalance +
          (finalInv.total - finalInv.paid) -
          (existing ? Math.max(0, (existing.total ?? 0) - (existing.paid ?? 0)) : 0);
        if (newBalance > party.creditLimit) {
          toast.warning(
            `${partyName} crossed credit limit ${fmtMoney(party.creditLimit)} — balance now ${fmtMoney(newBalance)}`,
          );
        }
      }
    }

    let savedId: string;
    if (existing?.id) {
      repo.updateBatched(batch, existing.id, finalInv);
      savedId = existing.id;
      toast.success(`${isSale ? "Sale" : "Purchase"} ${finalInv.number} updated`);
    } else {
      savedId = (repo.addBatched(batch, finalInv as any) as Invoice).id;
      toast.success(`${isSale ? "Sale" : "Purchase"} ${finalInv.number} saved`);
    }
    commitBatch(batch, `save ${isSale ? "sale" : "purchase"}`);
    if (andPrint) {
      navigate({
        to: isSale ? "/sales/$id" : "/purchase/$id",
        params: { id: savedId },
        search: { print: 1 },
      });
    } else {
      navigate({ to: isSale ? "/sales" : "/purchase" });
    }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") navigate({ to: isSale ? "/sales" : "/purchase" });
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-5 py-3 border-b bg-card flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`h-10 w-10 rounded-md flex items-center justify-center ${isSale ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}
          >
            {isSale ? <Receipt className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <h1 className="text-[17px] font-bold tracking-tight leading-tight">
              {existing ? "Edit" : "New"} {isSale ? "Sale Invoice" : "Purchase Bill"}
            </h1>
            <p className="text-[11px] text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">{inv.number}</span> ·
              Tab/Enter to move · Ctrl+S save · Esc cancel
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* GST toggle */}
          <label className="flex items-center gap-2 h-9 px-3 rounded-md border bg-background cursor-pointer select-none">
            <input
              type="checkbox"
              checked={gstOn}
              onChange={toggleGst}
              className="accent-primary"
            />
            <span className="text-[12px] font-semibold">GST Bill</span>
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: isSale ? "/sales" : "/purchase" })}
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button variant="outline" size="sm" onClick={() => save(true)} disabled={saving}>
            <Printer className="h-3.5 w-3.5" /> Save & Print
          </Button>
          <Button
            size="sm"
            onClick={() => save()}
            disabled={saving}
            className="bg-primary text-primary-foreground"
          >
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

      <div className="p-4 md:p-5 space-y-4 overflow-auto flex-1 bg-muted/30">
        {/* Party + meta */}
        <div className="bg-card border rounded-lg shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isSale ? "Customer Details" : "Supplier Details"}
            </span>
            {inv.partyId ? (
              <span className="inline-flex items-center gap-2">
                <span className="text-[11px] inline-flex items-center gap-1 text-success font-medium bg-success-soft px-2 py-0.5 rounded">
                  ✓ Existing party
                </span>
                {partyBalance !== null && Math.abs(partyBalance) > 0.01 && (
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded ${partyBalance > 0 ? "text-destructive bg-destructive/10" : "text-success bg-success-soft"}`}
                  >
                    {partyBalance > 0
                      ? `${isSale ? "Receivable" : "Payable"}: ${fmtMoney(partyBalance)}`
                      : `Advance: ${fmtMoney(-partyBalance)}`}
                  </span>
                )}
              </span>
            ) : partyQ || phoneQ ? (
              <span className="text-[11px] inline-flex items-center gap-1 text-primary font-medium bg-primary-soft px-2 py-0.5 rounded">
                <UserPlus className="h-3 w-3" /> Will auto-create on save
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative lg:col-span-2">
              <label className="flex flex-col gap-1 text-[12px]">
                <span className="text-muted-foreground font-medium">
                  {isSale ? "Customer Name" : "Supplier Name"} *
                </span>
                <div className="flex gap-1">
                  <input
                    ref={partyRef}
                    value={partyQ}
                    onChange={(e) => {
                      setPartyQ(e.target.value);
                      setPartyOpen(true);
                      setPartyIdx(0);
                      if (inv.partyId) setInv({ ...inv, partyId: "", partyName: e.target.value });
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
                        else phoneRef.current?.focus();
                      }
                    }}
                    className="h-9 px-3 border rounded-md bg-background focus:border-primary focus:ring-2 focus:ring-ring/20 outline-none flex-1"
                    placeholder="Type name or search…"
                  />
                  {inv.partyId && (
                    <button
                      type="button"
                      onClick={clearParty}
                      className="h-9 w-9 rounded-md border bg-background hover:bg-accent text-muted-foreground flex items-center justify-center"
                      title="Clear"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </label>
              {partyOpen && partySuggests.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 border rounded-md bg-popover shadow-elevated max-h-64 overflow-auto">
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
                      <div className="text-[11px] text-muted-foreground">
                        {p.phone && <>📞 {p.phone}</>}
                        {p.phone && p.gstin && " · "}
                        {p.gstin && <>GSTIN: {p.gstin}</>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-muted-foreground font-medium">Phone Number</span>
              <input
                ref={phoneRef}
                value={phoneQ}
                onChange={(e) => {
                  const v = e.target.value;
                  setPhoneQ(v);
                  if (inv.partyId) setInv({ ...inv, partyId: "", partyPhone: v });
                  // Auto-match by phone (10 digits)
                  if (v.length >= 10) {
                    const match = allParties.find((p) => (p.phone ?? "").trim() === v.trim());
                    if (match) selectParty(match);
                  }
                }}
                className="h-9 px-3 border rounded-md bg-background focus:border-primary focus:ring-2 focus:ring-ring/20 outline-none"
                placeholder="10-digit phone (auto-match)"
                inputMode="numeric"
              />
            </label>

            <Field
              id="inv-date"
              label="Bill Date"
              type="date"
              value={inv.date}
              onChange={(e) => setInv({ ...inv, date: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <div className="flex flex-col gap-1 text-[12px] md:col-span-1">
              <span className="text-muted-foreground font-medium">
                {isSale ? "Invoice #" : "Bill #"}
              </span>
              <div className="flex items-center gap-1">
                {numberEditing ? (
                  <>
                    <input
                      ref={numberRef}
                      value={inv.number}
                      onChange={(e) => setInv({ ...inv, number: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") setNumberEditing(false);
                      }}
                      className="h-9 px-3 border-2 border-primary rounded-md bg-background focus:outline-none font-mono font-semibold text-primary flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setNumberEditing(false)}
                      className="h-9 w-9 flex items-center justify-center rounded-md border bg-success-soft text-success hover:opacity-80 transition flex-shrink-0"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="h-9 px-3 border rounded-md bg-muted flex items-center font-mono font-semibold text-muted-foreground flex-1">
                      {inv.number}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNumberEditing(true);
                        setTimeout(() => numberRef.current?.focus(), 30);
                      }}
                      className="h-9 w-9 flex items-center justify-center rounded-md border bg-background hover:bg-accent text-muted-foreground hover:text-foreground transition flex-shrink-0"
                      title="Edit invoice number"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                Auto-generated · click ✎ to edit
              </span>
            </div>
          </div>
        </div>

        {/* Line items — search bar lives OUTSIDE the table's scroll container
            so its suggestion dropdown can never be clipped/hidden by it */}
        <div className="border rounded-lg bg-card shadow-card">
          <div className="px-4 py-2.5 border-b bg-muted/50 flex items-center justify-between rounded-t-lg">
            <span className="text-[13px] font-semibold">Items ({inv.lineItems.length})</span>
            <span className="text-[11px] text-muted-foreground">
              Search below to add items
            </span>
          </div>
          <ItemSearchBar
            items={items}
            onAdd={addLineItem}
            onAddNew={addNewItemByName}
            gstOn={gstOn}
            isSale={isSale}
          />
          <div className="overflow-x-auto rounded-b-lg">
            <table className="w-full text-[13px] min-w-[720px]">
              <thead className="text-[11px] text-muted-foreground uppercase tracking-wider">
                <tr className="bg-muted/40">
                  <th className="text-left px-3 py-2 w-8">#</th>
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-right w-20 py-2 px-2">Qty</th>
                  <th className="text-left w-20 py-2 px-2">Unit</th>
                  <th className="text-right w-24 py-2 px-2">Price</th>
                  <th className="text-right w-20 py-2 px-2">Disc%</th>
                  {gstOn && <th className="text-right w-20 py-2 px-2">GST%</th>}
                  <th className="text-right w-28 py-2 pr-3">Amount</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {inv.lineItems.map((l, idx) => (
                  <tr key={l.id} className="border-t hover:bg-accent/30">
                    <td className="px-3 py-1.5 text-muted-foreground text-[11px]">{idx + 1}</td>
                    <td className="px-3 py-1.5">
                      <div className="font-medium">{l.name}</div>
                    </td>
                    <td className="py-1.5 px-1">
                      <NumInput
                        value={l.qty}
                        onValue={(n) => updateLine(l.id, { qty: n })}
                        className="w-full h-7 px-1.5 text-right border rounded bg-background focus:border-primary outline-none"
                      />
                    </td>
                    <td className="py-1.5 px-1">
                      <input
                        value={l.unit}
                        onChange={(e) => updateLine(l.id, { unit: e.target.value })}
                        className="w-full h-7 px-1.5 border rounded bg-background focus:border-primary outline-none"
                      />
                    </td>
                    <td className="py-1.5 px-1">
                      <NumInput
                        value={l.price}
                        onValue={(n) => updateLine(l.id, { price: n })}
                        className="w-full h-7 px-1.5 text-right border rounded bg-background focus:border-primary outline-none"
                      />
                    </td>
                    <td className="py-1.5 px-1">
                      <NumInput
                        value={l.discountPct}
                        onValue={(n) => updateLine(l.id, { discountPct: n })}
                        className="w-full h-7 px-1.5 text-right border rounded bg-background focus:border-primary outline-none"
                      />
                    </td>
                    {gstOn && (
                      <td className="py-1.5 px-1">
                        <NumInput
                        value={l.gstRate}
                        onValue={(n) => updateLine(l.id, { gstRate: n })}
                        className="w-full h-7 px-1.5 text-right border rounded bg-background focus:border-primary outline-none"
                      />
                      </td>
                    )}
                    <td className="text-right px-3 py-1.5 font-semibold tabular-nums">
                      {fmtMoney(l.amount)}
                    </td>
                    <td className="py-1.5 px-1">
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
                {inv.lineItems.length === 0 && (
                  <tr className="border-t">
                    <td
                      colSpan={gstOn ? 9 : 8}
                      className="px-3 py-6 text-center text-muted-foreground text-[12px]"
                    >
                      No items yet — type in the search box above to add
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals + notes */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border rounded-lg shadow-card p-4">
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-muted-foreground font-medium uppercase text-[11px] tracking-wider">
                Notes / Terms
              </span>
              <textarea
                value={inv.notes ?? ""}
                onChange={(e) => setInv({ ...inv, notes: e.target.value })}
                placeholder="Add any note or terms & conditions…"
                className="min-h-[100px] px-3 py-2 border rounded-md bg-background focus:border-primary focus:ring-2 focus:ring-ring/20 outline-none"
              />
            </label>
          </div>
          <div className="border rounded-lg bg-card shadow-card p-4 space-y-2 text-sm">
            <Row label="Subtotal" value={fmtMoney(inv.subtotal)} />
            {gstOn && <Row label="Tax (GST)" value={fmtMoney(inv.taxAmount)} />}
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground">Extra Discount</span>
              <NumInput
                value={inv.discount}
                onValue={(n) => setDiscount(n)}
                className="w-28 h-8 px-2 text-right border rounded-md bg-background focus:border-primary outline-none tabular-nums"
              />
            </div>
            {!!inv.roundOff && Math.abs(inv.roundOff) > 0.001 && (
              <Row
                label="Round Off"
                value={`${inv.roundOff > 0 ? "+" : "−"}${fmtMoney(Math.abs(inv.roundOff))}`}
              />
            )}
            <div className="flex justify-between items-center gap-2 pt-2 mt-1 border-t font-bold text-lg">
              <span>Total</span>
              <span className="tabular-nums text-primary">{fmtMoney(inv.total)}</span>
            </div>
            <div className="flex flex-col gap-1.5 pt-2 mt-1 border-t">
              <span className="text-muted-foreground">Payment Mode</span>
              <ModePills
                value={inv.paymentMode}
                onChange={(mode: PaymentMode) =>
                  setInv({ ...inv, paymentMode: mode, paid: mode === "credit" ? 0 : inv.paid })
                }
                modes={["cash", "upi", "bank", "cheque", "credit"]}
              />
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground">Paid Amount</span>
              {inv.paymentMode === "credit" ? (
                <span className="text-[12px] text-muted-foreground select-none">
                  ₹0.00 — will pay later
                </span>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setInv({ ...inv, paid: inv.total })}
                    className="h-8 px-2 rounded-md border bg-success-soft text-success text-[11px] font-semibold hover:opacity-80 transition"
                    title="Received full amount"
                  >
                    Full
                  </button>
                  <NumInput
                    value={inv.paid}
                    onValue={(n) => setInv({ ...inv, paid: n })}
                    className="w-24 h-8 px-2 text-right border rounded-md bg-background focus:border-primary outline-none tabular-nums"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-between items-center gap-2 pt-1 font-semibold">
              <span>Balance Due</span>
              <span
                className={`tabular-nums ${inv.total - inv.paid > 0 ? "text-destructive" : "text-success"}`}
              >
                {fmtMoney(Math.max(0, inv.total - inv.paid))}
              </span>
            </div>
          </div>
        </div>
      </div>
      <PrintableInvoice inv={inv} company={company} mode={mode} />
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function ItemSearchBar({
  items,
  onAdd,
  onAddNew,
  gstOn,
  isSale,
}: {
  items: Item[];
  onAdd: (i: Item) => void;
  onAddNew: (name: string) => void;
  gstOn: boolean;
  isSale: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Empty query = NO suggestions — otherwise Enter/ArrowDown on the empty box
  // would act on an invisible list of all items and add a phantom line
  const suggests = q.trim()
    ? items
        .filter(
          (i) =>
            i.name.toLowerCase().includes(q.toLowerCase()) ||
            i.sku?.toLowerCase().includes(q.toLowerCase()) ||
            i.barcode?.includes(q),
        )
        .slice(0, 8)
    : [];

  // Offer "add as new item" whenever the typed name doesn't exactly match an existing one
  const trimmed = q.trim();
  const showAddNew =
    trimmed.length > 0 && !items.some((i) => i.name.trim().toLowerCase() === trimmed.toLowerCase());
  const optionCount = suggests.length + (showAddNew ? 1 : 0);

  const reset = () => {
    setQ("");
    setOpen(false);
    setIdx(0);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const pick = (it: Item) => {
    onAdd(it);
    reset();
  };
  const pickNew = () => {
    onAddNew(trimmed);
    reset();
  };
  const choose = (i: number) => {
    if (i < suggests.length) pick(suggests[i]);
    else if (showAddNew) pickNew();
  };

  return (
    <div className="p-2 relative bg-primary-soft/40 border-b">
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
              setIdx((i) => Math.min(optionCount - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (optionCount > 0) choose(idx);
            }
          }}
          placeholder="🔍  Type item name — pick from list or add as new item (Enter to add)"
          className="w-full h-9 px-3 border rounded-md bg-background focus:border-primary focus:ring-2 focus:ring-ring/20 outline-none text-sm"
        />
      {open && optionCount > 0 && (
          <div className="absolute z-30 top-full left-2 right-2 -mt-0.5 border rounded-md bg-popover shadow-elevated max-h-72 overflow-auto">
            {suggests.map((it, i) => (
              <div
                key={it.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(it);
                }}
                className={`px-3 py-2 text-sm cursor-pointer flex justify-between ${i === idx ? "bg-accent" : "hover:bg-accent"}`}
              >
                <div>
                  <div className="font-semibold">{it.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Stock: {it.stock} {it.unit}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">
                    {fmtMoney(isSale ? it.salePrice || it.purchasePrice : it.purchasePrice)}
                  </div>
                  {gstOn && (
                    <div className="text-[11px] text-muted-foreground">GST {it.gstRate}%</div>
                  )}
                </div>
              </div>
            ))}
            {showAddNew && (
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickNew();
                }}
                className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 border-t ${idx === suggests.length ? "bg-accent" : "hover:bg-accent"}`}
              >
                <span className="h-5 w-5 rounded bg-primary-soft text-primary flex items-center justify-center text-xs font-bold">
                  +
                </span>
                <span>
                  Add "<span className="font-semibold">{trimmed}</span>" as new item — set price &
                  qty in the row
                </span>
              </div>
            )}
          </div>
        )}
    </div>
  );
}

import type { Invoice, Payment, Return, Item, Expense, PaymentMode, CashAdjustment } from "@/types";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Sum of a payment's per-invoice allocations. Legacy payments (saved before
 * allocations existed) stored the linked invoice numbers in `ref` — if every
 * comma-separated token matches a known invoice number, the whole amount
 * was applied to invoices. */
export function allocatedAmount(p: Payment, invoiceNumbers?: Set<string>): number {
  if (p.allocations && p.allocations.length) {
    return r2(p.allocations.reduce((s, a) => s + a.amount, 0));
  }
  if (p.ref && invoiceNumbers) {
    const tokens = p.ref
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length && tokens.every((t) => invoiceNumbers.has(t))) return p.amount;
  }
  return 0;
}

/** Portion of a payment NOT applied to any invoice (an advance). */
export function advanceAmount(p: Payment, invoiceNumbers?: Set<string>): number {
  return Math.max(0, r2(p.amount - allocatedAmount(p, invoiceNumbers)));
}

/** invoiceId → total amount settled through Payment records. */
export function paidViaPayments(payments: Payment[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payments) {
    for (const a of p.allocations ?? []) {
      map.set(a.invoiceId, r2((map.get(a.invoiceId) ?? 0) + a.amount));
    }
  }
  return map;
}

export interface PartyBalance {
  partyId: string;
  name: string;
  invoiced: number;
  returned: number;
  /** invoice.paid totals (initial paid + amounts applied via payments) */
  settled: number;
  /** payment amounts not applied to any invoice */
  advances: number;
  /** invoiced − returned − settled − advances (positive = they owe / we owe) */
  balance: number;
}

/** Per-party outstanding balances. Pass sales + sale returns + type "in"
 * payments for customers, or purchases + purchase returns + type "out"
 * payments for suppliers. Applied payments are already inside invoice.paid,
 * so only the advance portion of each payment is subtracted separately —
 * this is what keeps the dashboard and ledger reports in agreement.
 *
 * Pass the relevant parties so a party's openingBalance is folded into the
 * result — without this, a migrated party with a non-zero opening balance
 * but no transactions yet would be invisible here even though their own
 * statement page (parties_.$id.tsx) correctly shows what they owe.
 *
 * `side` prevents double counting: parties are type "both", so one opening
 * balance must not appear in BOTH the receivable and payable totals. Sign
 * convention: positive opening = the party owes us (counts on the customer
 * side only), negative = we owe them (counts on the supplier side only).
 * Omit `side` (statement page) to use the signed value as-is. */
export function partyBalances(
  invoices: Invoice[],
  returns: Return[],
  payments: Payment[],
  parties: { id: string; name: string; openingBalance?: number }[] = [],
  side?: "customer" | "supplier",
): PartyBalance[] {
  const numbers = new Set(invoices.map((i) => i.number));
  const map = new Map<string, PartyBalance>();
  const entry = (id: string, name: string): PartyBalance => {
    let e = map.get(id);
    if (!e) {
      e = { partyId: id, name, invoiced: 0, returned: 0, settled: 0, advances: 0, balance: 0 };
      map.set(id, e);
    }
    return e;
  };
  for (const p of parties) {
    entry(p.id, p.name);
  }
  for (const inv of invoices) {
    const e = entry(inv.partyId, inv.partyName);
    e.invoiced = r2(e.invoiced + (inv.total || 0));
    e.settled = r2(e.settled + (inv.paid || 0));
  }
  for (const ret of returns) {
    const e = entry(ret.partyId, ret.partyName);
    e.returned = r2(e.returned + (ret.total || 0));
  }
  for (const p of payments) {
    const e = entry(p.partyId, p.partyName);
    e.advances = r2(e.advances + advanceAmount(p, numbers));
  }
  const openingById = new Map(parties.map((p) => [p.id, p.openingBalance ?? 0]));
  for (const e of map.values()) {
    const raw = openingById.get(e.partyId) ?? 0;
    const opening =
      side === "customer" ? Math.max(0, raw) : side === "supplier" ? Math.max(0, -raw) : raw;
    e.balance = r2(opening + e.invoiced - e.returned - e.settled - e.advances);
  }
  return Array.from(map.values());
}

export interface FlowEntry {
  date: string;
  type: string;
  ref: string;
  in: number;
  out: number;
}

/** Money movement for one payment mode (cash, bank, …). Amounts settled
 * later via Payment records count under the payment's own mode, not the
 * invoice's, so nothing is counted twice. */
export function modeFlows(
  mode: PaymentMode,
  sales: Invoice[],
  purchases: Invoice[],
  expenses: Expense[],
  payments: Payment[],
): FlowEntry[] {
  const applied = paidViaPayments(payments);
  const list: FlowEntry[] = [];
  for (const s of sales) {
    if (s.paymentMode !== mode) continue;
    const direct = Math.max(0, r2((s.paid || 0) - (applied.get(s.id) ?? 0)));
    if (direct > 0)
      list.push({
        date: s.date,
        type: "Sale",
        ref: `${s.number} — ${s.partyName}`,
        in: direct,
        out: 0,
      });
  }
  for (const s of purchases) {
    if (s.paymentMode !== mode) continue;
    const direct = Math.max(0, r2((s.paid || 0) - (applied.get(s.id) ?? 0)));
    if (direct > 0)
      list.push({
        date: s.date,
        type: "Purchase",
        ref: `${s.number} — ${s.partyName}`,
        in: 0,
        out: direct,
      });
  }
  for (const e of expenses) {
    if (e.paymentMode === mode)
      list.push({ date: e.date, type: "Expense", ref: e.category, in: 0, out: e.amount });
  }
  for (const p of payments) {
    if (p.mode !== mode) continue;
    list.push({
      date: p.date,
      type: p.type === "in" ? "Payment In" : "Payment Out",
      ref: p.partyName,
      in: p.type === "in" ? p.amount : 0,
      out: p.type === "out" ? p.amount : 0,
    });
  }
  list.sort((a, b) => b.date.localeCompare(a.date));
  return list;
}

export const netFlow = (entries: FlowEntry[]) => r2(entries.reduce((s, e) => s + e.in - e.out, 0));

/** Cash-mode flows plus manual cash adjustments (counter corrections, drawings). */
export function cashFlows(
  sales: Invoice[],
  purchases: Invoice[],
  expenses: Expense[],
  payments: Payment[],
  adjustments: CashAdjustment[],
): FlowEntry[] {
  const list = modeFlows("cash", sales, purchases, expenses, payments);
  for (const a of adjustments) {
    list.push({
      date: a.date,
      type: a.type === "add" ? "Cash Added" : "Cash Reduced",
      ref: a.reason || "Manual adjustment",
      in: a.type === "add" ? a.amount : 0,
      out: a.type === "reduce" ? a.amount : 0,
    });
  }
  list.sort((a, b) => b.date.localeCompare(a.date));
  return list;
}

/** UPI and cheques settle into the bank — group them with bank-mode flows. */
export function bankFlows(
  sales: Invoice[],
  purchases: Invoice[],
  expenses: Expense[],
  payments: Payment[],
): FlowEntry[] {
  const modes: PaymentMode[] = ["bank", "upi", "cheque"];
  const list = modes.flatMap((m) => modeFlows(m, sales, purchases, expenses, payments));
  list.sort((a, b) => b.date.localeCompare(a.date));
  return list;
}

/** Cost of goods sold from per-line cost snapshots, falling back to the
 * item's current purchase price for lines saved before costPrice existed. */
export function computeCogs(sales: Invoice[], saleReturns: Return[], items: Item[]): number {
  const cost = new Map(items.map((i) => [i.id, i.purchasePrice] as const));
  const lineCost = (l: { itemId: string; qty: number; costPrice?: number }) =>
    (l.costPrice ?? cost.get(l.itemId) ?? 0) * l.qty;
  const sold = sales.reduce((s, inv) => s + inv.lineItems.reduce((a, l) => a + lineCost(l), 0), 0);
  const returned = saleReturns.reduce(
    (s, ret) => s + ret.lineItems.reduce((a, l) => a + lineCost(l), 0),
    0,
  );
  return r2(sold - returned);
}

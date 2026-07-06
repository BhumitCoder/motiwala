export type ID = string;

export interface Party {
  id: ID;
  name: string;
  type: "customer" | "supplier" | "both";
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
  shippingAddress?: string;
  openingBalance: number;
  creditLimit?: number;
  createdAt: string;
}

export interface Item {
  id: ID;
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  unit: string;
  hsn?: string;
  gstRate: number;
  purchasePrice: number;
  salePrice: number;
  wholesalePrice?: number;
  stock: number;
  minStock?: number;
  openingStock: number;
  description?: string;
  createdAt: string;
}

export interface LineItem {
  id: ID;
  itemId: ID;
  name: string;
  qty: number;
  unit: string;
  price: number;
  discountPct: number;
  gstRate: number;
  amount: number;
  /** Snapshot of the item's purchase price when the line was created — used for stock-based COGS in P&L */
  costPrice?: number;
}

export type PaymentMode = "cash" | "bank" | "credit" | "upi" | "cheque";

export interface Invoice {
  id: ID;
  number: string;
  date: string;
  partyId: ID;
  partyName: string;
  partyPhone?: string;
  gstEnabled?: boolean;
  lineItems: LineItem[];
  subtotal: number;
  discount: number;
  /** Flat shipping/freight charge added to the total (sale bills only). */
  shippingCharge?: number;
  taxAmount: number;
  /** Rounding applied to reach a whole-rupee total (e.g. −0.37 or +0.45) */
  roundOff?: number;
  total: number;
  paid: number;
  paymentMode: PaymentMode;
  /** Which bank account `paid` was collected into/from — only set when paymentMode is "bank". */
  bankId?: ID;
  /** Snapshot of `paid` at the moment it was attributed to bankId, so an edit can
   * reverse exactly that amount even if `paid` later grows via Payment allocations. */
  bankPaidAmount?: number;
  notes?: string;
  createdAt: string;
}

export interface Expense {
  id: ID;
  date: string;
  category: string;
  amount: number;
  paymentMode: PaymentMode;
  notes?: string;
  createdAt: string;
}

export interface BankAccount {
  id: ID;
  name: string;
  accountNumber?: string;
  ifsc?: string;
  openingBalance: number;
  balance: number;
  createdAt: string;
}

/** Physical stock correction (damage, counting difference, samples…) */
export interface StockAdjustment {
  id: ID;
  itemId: ID;
  itemName: string;
  date: string;
  type: "add" | "reduce";
  qty: number;
  reason?: string;
  createdAt: string;
}

/** Manual cash-in-hand correction (counter counting, owner drawings…) */
export interface CashAdjustment {
  id: ID;
  date: string;
  type: "add" | "reduce";
  amount: number;
  reason?: string;
  createdAt: string;
}

export interface BankTxn {
  id: ID;
  bankId: ID;
  date: string;
  type: "deposit" | "withdraw" | "transfer";
  amount: number;
  notes?: string;
  createdAt: string;
}

/** How much of a payment was applied to which invoice — needed to reverse
 * invoice.paid when the payment is deleted, and to avoid double counting
 * in ledgers/cash reports. */
export interface PaymentAllocation {
  invoiceId: ID;
  number: string;
  amount: number;
}

export interface Payment {
  id: ID;
  date: string;
  partyId: ID;
  partyName: string;
  type: "in" | "out";
  amount: number;
  mode: PaymentMode;
  /** Which bank account this moved money into/out of — only set when mode is "bank". */
  bankId?: ID;
  ref?: string;
  allocations?: PaymentAllocation[];
  createdAt: string;
}

export interface Return {
  id: ID;
  number: string;
  date: string;
  originalRef?: string;
  partyId: ID;
  partyName: string;
  partyPhone?: string;
  gstEnabled?: boolean;
  lineItems: LineItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  notes?: string;
  createdAt: string;
}

export type PrintFormat = "a4" | "a4-2up" | "thermal80" | "thermal58";

export interface Company {
  name: string;
  gstin?: string;
  phone?: string;
  email?: string;
  address?: string;
  currency: string;
  invoicePrefix: string;
  purchasePrefix: string;
  enableGst?: boolean;
  /** Round invoice totals to the nearest rupee (default on) */
  enableRoundOff?: boolean;
  /** Allow a sale/purchase-return to push item stock below zero (default on,
   * matching Vyapar/Tally — counter billing shouldn't block on stock entry
   * lagging behind). When turned off, such saves are blocked with an error
   * instead of just a warning. */
  allowNegativeStock?: boolean;
  /** Preferred print format, remembered from the invoice page */
  printFormat?: PrintFormat;
}

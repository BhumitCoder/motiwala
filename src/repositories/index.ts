import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { Repository } from "./base";
import { db, isBrowser } from "@/lib/firebase";
import { toast } from "sonner";
import type {
  Party,
  Item,
  Invoice,
  Expense,
  BankAccount,
  BankTxn,
  Payment,
  Return,
  Company,
  StockAdjustment,
  CashAdjustment,
} from "@/types";

export const PartyRepo = new Repository<Party>("parties");
export const ItemRepo = new Repository<Item>("items");
export const SalesRepo = new Repository<Invoice>("sales");
export const PurchaseRepo = new Repository<Invoice>("purchases");
export const SaleReturnRepo = new Repository<Return>("sale-returns");
export const PurchaseReturnRepo = new Repository<Return>("purchase-returns");
export const ExpenseRepo = new Repository<Expense>("expenses");
export const BankRepo = new Repository<BankAccount>("banks");
export const BankTxnRepo = new Repository<BankTxn>("bankTxns");
export const PaymentRepo = new Repository<Payment>("payments");
export const StockAdjustmentRepo = new Repository<StockAdjustment>("stock-adjustments");
export const CashAdjustmentRepo = new Repository<CashAdjustment>("cash-adjustments");

const defaultCompany: Company = {
  name: "My Company",
  currency: "INR",
  invoicePrefix: "INV-",
  purchasePrefix: "PUR-",
  enableGst: true,
};

/** Company settings live in a single Firestore doc: settings/company */
let companyCache: Company = defaultCompany;
let companyUnsub: (() => void) | undefined;
let companyExists = false;

function hydrateCompany(): Promise<void> {
  if (!isBrowser || companyUnsub) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let first = true;
    companyUnsub = onSnapshot(
      doc(db, "settings", "company"),
      (snap) => {
        companyExists = snap.exists();
        companyCache = snap.exists()
          ? { ...defaultCompany, ...(snap.data() as Company) }
          : defaultCompany;
        if (first) {
          first = false;
          resolve();
        }
      },
      (err) => {
        console.error("Failed to load company settings", err);
        if (first) {
          first = false;
          reject(err);
        }
      },
    );
  });
}

export const CompanyRepo = {
  get(): Company {
    return companyCache;
  },
  save(c: Company) {
    companyCache = c;
    companyExists = true;
    if (isBrowser) {
      setDoc(doc(db, "settings", "company"), c).catch((err) => {
        console.error("Failed to save company settings", err);
        toast.error("Could not save settings to cloud. Check internet & try again.");
      });
    }
  },
};

/** Map of legacy localStorage keys → repositories (backup files & migration). */
export const REPO_BY_KEY: Record<string, Repository<{ id: string }>> = {
  "bz.parties": PartyRepo as Repository<{ id: string }>,
  "bz.items": ItemRepo as Repository<{ id: string }>,
  "bz.sales": SalesRepo as Repository<{ id: string }>,
  "bz.purchases": PurchaseRepo as Repository<{ id: string }>,
  "bz.sale-returns": SaleReturnRepo as Repository<{ id: string }>,
  "bz.purchase-returns": PurchaseReturnRepo as Repository<{ id: string }>,
  "bz.expenses": ExpenseRepo as Repository<{ id: string }>,
  "bz.banks": BankRepo as Repository<{ id: string }>,
  "bz.bankTxns": BankTxnRepo as Repository<{ id: string }>,
  "bz.payments": PaymentRepo as Repository<{ id: string }>,
  "bz.stock-adjustments": StockAdjustmentRepo as Repository<{ id: string }>,
  "bz.cash-adjustments": CashAdjustmentRepo as Repository<{ id: string }>,
};

const ALL_REPOS = Object.values(REPO_BY_KEY);

/** Load everything after login; resolves when every collection has its first snapshot. */
export async function hydrateRepos(): Promise<void> {
  await Promise.all([...ALL_REPOS.map((r) => r.hydrate()), hydrateCompany()]);
}

/** Stop all listeners and clear caches (on logout). */
export function stopRepos() {
  ALL_REPOS.forEach((r) => r.stop());
  companyUnsub?.();
  companyUnsub = undefined;
  companyCache = defaultCompany;
  companyExists = false;
}

/**
 * One-time migration: if the cloud is completely empty but this browser still
 * has old localStorage data, upload it. localStorage is left untouched as a
 * safety copy. Returns the number of migrated records.
 */
export async function migrateFromLocalStorage(): Promise<number> {
  if (!isBrowser) return 0;
  const cloudHasData = ALL_REPOS.some((r) => r.all().length > 0) || companyExists;
  if (cloudHasData) return 0;

  let migrated = 0;
  for (const [key, repo] of Object.entries(REPO_BY_KEY)) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const records = JSON.parse(raw) as { id: string }[];
      if (Array.isArray(records) && records.length) {
        await repo.importAll(records);
        migrated += records.length;
      }
    } catch (err) {
      console.error(`Migration of ${key} failed`, err);
    }
  }
  try {
    const rawCompany = localStorage.getItem("bz.company");
    if (rawCompany) CompanyRepo.save({ ...defaultCompany, ...JSON.parse(rawCompany) });
  } catch (err) {
    console.error("Migration of company settings failed", err);
  }
  return migrated;
}

export function nextInvoiceNumber(prefix: string, existing: { number: string }[]): string {
  // Read the trailing digit run instead of stripping the CURRENT prefix —
  // if the prefix is ever changed in Settings, older numbers (saved under
  // the old prefix) would otherwise be invisible to the max() below and
  // could get reissued once the prefix is changed back.
  const nums = existing
    .map((i) => {
      const m = i.number.match(/(\d+)\s*$/);
      return m ? parseInt(m[1], 10) : NaN;
    })
    .filter((n) => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

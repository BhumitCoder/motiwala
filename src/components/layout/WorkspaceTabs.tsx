import { useWorkspace } from "@/store/workspace";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  PartyRepo,
  ItemRepo,
  SalesRepo,
  PurchaseRepo,
  SaleReturnRepo,
  PurchaseReturnRepo,
  BankRepo,
} from "@/repositories";

export function WorkspaceTabs() {
  const { tabs, closeTab, openTab } = useWorkspace();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const routeTitle = titleFromPath(pathname);

  useEffect(() => {
    if (!routeTitle) return;
    openTab({ id: pathname, title: routeTitle, path: pathname });
  }, [pathname, routeTitle, openTab]);

  if (!tabs.length) return null;

  // Closing the tab you're currently looking at needs to actually move you
  // somewhere — otherwise the tab strip changes but the page underneath
  // doesn't. Land on the last remaining tab, or the Dashboard once none are
  // left (which then re-opens its own tab via the effect above).
  const handleClose = (tabId: string, tabPath: string) => {
    const wasActive = tabPath === pathname;
    closeTab(tabId);
    if (wasActive) {
      const remaining = tabs.filter((t) => t.id !== tabId);
      const next = remaining[remaining.length - 1];
      navigate({ to: next ? next.path : "/" });
    }
  };

  return (
    <div className="hidden md:flex h-10 border-b bg-muted/50 items-end px-2 gap-0.5 overflow-x-auto shrink-0">
      {tabs.map((tab) => {
        const active = tab.path === pathname;
        return (
          <div
            key={tab.id}
            className={cn(
              "group flex items-center gap-1.5 h-9 pl-3.5 pr-1.5 border border-b-0 rounded-t-md text-[12px] cursor-pointer transition-colors",
              active
                ? "bg-background border-border font-semibold text-foreground shadow-[0_-2px_0_var(--color-primary)_inset]"
                : "bg-transparent border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground",
            )}
          >
            <Link to={tab.path} className="max-w-[160px] truncate">
              {tab.title}
            </Link>
            <button
              onClick={(e) => {
                e.preventDefault();
                handleClose(tab.id, tab.path);
              }}
              className="opacity-40 hover:opacity-100 hover:bg-accent rounded p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Detail pages (open from a list row, or from another detail page like item
// history) get their own tab too, titled with the actual record — not just
// left to silently reuse whatever tab happened to be active.
const DETAIL_ROUTES: { re: RegExp; title: (id: string) => string | null }[] = [
  { re: /^\/sales\/edit\/([^/]+)$/, title: (id) => {
    const inv = SalesRepo.get(id);
    return inv ? `Edit ${inv.number}` : null;
  } },
  { re: /^\/purchase\/edit\/([^/]+)$/, title: (id) => {
    const inv = PurchaseRepo.get(id);
    return inv ? `Edit ${inv.number}` : null;
  } },
  { re: /^\/sales\/([^/]+)$/, title: (id) => SalesRepo.get(id)?.number ?? null },
  { re: /^\/purchase\/([^/]+)$/, title: (id) => PurchaseRepo.get(id)?.number ?? null },
  { re: /^\/sale-return\/([^/]+)$/, title: (id) => SaleReturnRepo.get(id)?.number ?? null },
  { re: /^\/purchase-return\/([^/]+)$/, title: (id) => PurchaseReturnRepo.get(id)?.number ?? null },
  { re: /^\/parties\/([^/]+)$/, title: (id) => PartyRepo.get(id)?.name ?? null },
  { re: /^\/items\/([^/]+)$/, title: (id) => ItemRepo.get(id)?.name ?? null },
  { re: /^\/bank\/([^/]+)$/, title: (id) => BankRepo.get(id)?.name ?? null },
];

function titleFromPath(path: string): string | null {
  if (path === "/") return "Dashboard";
  const map: Record<string, string> = {
    "/parties": "Parties",
    "/items": "Items",
    "/sales": "Sales",
    "/sales/new": "New Sale",
    "/purchase": "Purchase",
    "/purchase/new": "New Purchase",
    "/sale-return": "Sale Return",
    "/sale-return/new": "New Sale Return",
    "/purchase-return": "Purchase Return",
    "/purchase-return/new": "New Purchase Return",
    "/expenses": "Expenses",
    "/payments": "Payments",
    "/inventory": "Inventory",
    "/bank": "Bank",
    "/cash": "Cash",
    "/reports": "Reports",
    "/daybook": "Daybook",
    "/gst": "GST",
    "/settings": "Settings",
  };
  if (map[path]) return map[path];
  for (const d of DETAIL_ROUTES) {
    const m = path.match(d.re);
    if (m) return d.title(m[1]);
  }
  return null;
}

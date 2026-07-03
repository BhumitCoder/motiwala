import { useWorkspace } from "@/store/workspace";
import { Link, useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

export function WorkspaceTabs() {
  const { tabs, closeTab, openTab } = useWorkspace();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const routeTitle = titleFromPath(pathname);

  useEffect(() => {
    if (!routeTitle) return;
    openTab({ id: pathname, title: routeTitle, path: pathname });
  }, [pathname, routeTitle, openTab]);

  if (!tabs.length) return null;

  return (
    <div className="h-10 border-b bg-muted/50 flex items-end px-2 gap-0.5 overflow-x-auto shrink-0">
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
                closeTab(tab.id);
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

function titleFromPath(path: string): string | null {
  if (path === "/") return "Dashboard";
  const map: Record<string, string> = {
    "/parties": "Parties",
    "/items": "Items",
    "/sales": "Sales",
    "/sales/new": "New Sale",
    "/purchase": "Purchase",
    "/purchase/new": "New Purchase",
    "/expenses": "Expenses",
    "/payments": "Payments",
    "/inventory": "Inventory",
    "/bank": "Bank",
    "/cash": "Cash",
    "/reports": "Reports",
    "/gst": "GST",
    "/settings": "Settings",
  };
  return map[path] ?? null;
}

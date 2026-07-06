import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Receipt, Plus, Users, Menu } from "lucide-react";
import { useWorkspace } from "@/store/workspace";
import { cn } from "@/lib/utils";

/**
 * Mobile-only bottom tab bar (hidden at md: and up, where the sidebar is
 * docked) — the single biggest thing that makes a responsive website start
 * feeling like a native billing app: thumb-reachable primary actions instead
 * of a hamburger menu for everything.
 */
export function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const toggleMobileNav = useWorkspace((s) => s.toggleMobileNav);

  const isActive = (p: string) => (p === "/" ? pathname === "/" : pathname.startsWith(p));

  const tabClass = (active: boolean) =>
    cn(
      "flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 transition-colors",
      active ? "text-primary" : "text-gray-400",
    );

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 flex items-stretch h-[60px]"
      style={{ boxShadow: "0 -2px 10px rgba(0,0,0,0.06)" }}
    >
      <Link to="/" className={tabClass(isActive("/"))}>
        <LayoutDashboard className="h-5 w-5" />
        <span className="text-[10px] font-semibold">Home</span>
      </Link>
      <Link to="/sales" className={tabClass(isActive("/sales"))}>
        <Receipt className="h-5 w-5" />
        <span className="text-[10px] font-semibold">Sales</span>
      </Link>

      {/* Center FAB — the single most common action (billing a sale) always one tap away */}
      <div className="flex-1 flex items-start justify-center">
        <button
          onClick={() => navigate({ to: "/sales/new" })}
          className="-mt-5 h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg ring-4 ring-white active:scale-95 transition-transform"
          title="Add Sale"
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      <Link to="/parties" className={tabClass(isActive("/parties"))}>
        <Users className="h-5 w-5" />
        <span className="text-[10px] font-semibold">Parties</span>
      </Link>
      <button onClick={toggleMobileNav} className={tabClass(false)}>
        <Menu className="h-5 w-5" />
        <span className="text-[10px] font-semibold">More</span>
      </button>
    </nav>
  );
}

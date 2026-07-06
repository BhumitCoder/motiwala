import { Search, Plus, Building2, ChevronDown, Menu, LogOut } from "lucide-react";
import { useWorkspace } from "@/store/workspace";
import { useNavigate } from "@tanstack/react-router";
import { CompanyRepo, stopRepos } from "@/repositories";
import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { auth, isBrowser } from "@/lib/firebase";
import { toast } from "sonner";

export function Topbar() {
  const { setGlobalSearch, toggleMobileNav } = useWorkspace();
  const navigate = useNavigate();
  const [company, setCompany] = useState(() => CompanyRepo.get());
  useEffect(() => {
    const t = setInterval(() => setCompany(CompanyRepo.get()), 2000);
    return () => clearInterval(t);
  }, []);
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <header className="h-14 bg-gradient-brand text-brand-foreground shrink-0 shadow-elevated grid grid-cols-[auto_1fr_auto] md:flex items-center px-3 md:px-4 gap-2 md:gap-3">
      <button
        onClick={toggleMobileNav}
        className="md:hidden h-8 w-8 rounded-md hover:bg-white/15 flex items-center justify-center text-white/90"
        title="Toggle menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Full search bar — desktop only. Every list page already has its
          own page-specific search box right below the header, so a second
          generic search bar up here was redundant clutter on mobile. */}
      <button
        onClick={() => setGlobalSearch(true)}
        className="hidden md:flex flex-1 min-w-0 max-w-xl items-center gap-2 h-8 px-3.5 rounded-md bg-white/15 hover:bg-white/25 text-white/95 backdrop-blur-sm transition-colors ring-1 ring-white/10"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left text-sm truncate">
          Search customer, item, invoice…
        </span>
        <kbd className="hidden sm:inline-flex text-[10px] font-mono bg-white/20 border-white/20 text-white">
          Ctrl+F
        </kbd>
      </button>

      {/* Mobile — company name sits centered in the one header row,
          between the menu icon and the search/Sale actions. */}
      <span className="md:hidden text-center text-[13px] font-semibold text-white/90 truncate px-2">
        {company.name}
      </span>

      <div className="hidden md:block flex-1" />

      {/* Mobile — compact search icon (opens the same global search
          overlay) + Sale button, grouped on the right of the single row. */}
      <div className="md:hidden flex items-center gap-1.5 justify-self-end">
        <button
          onClick={() => setGlobalSearch(true)}
          className="h-8 w-8 rounded-md hover:bg-white/15 flex items-center justify-center text-white/90 shrink-0"
          title="Search"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          onClick={() => navigate({ to: "/sales/new" })}
          className="shrink-0 h-9 px-3.5 rounded-full bg-white text-primary hover:bg-white/95 font-bold text-sm flex items-center gap-1.5 shadow-md transition"
        >
          <span className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
            <Plus className="h-3.5 w-3.5" />
          </span>
          Sale
        </button>
      </div>

      {/* Primary actions — desktop only */}
      <button
        onClick={() => navigate({ to: "/sales/new" })}
        className="hidden md:flex h-8 px-4 rounded-md bg-white text-primary hover:bg-white/95 font-semibold text-sm items-center gap-1.5 shadow-card transition"
      >
        <Plus className="h-4 w-4" /> Add Sale
        <kbd className="hidden md:inline-flex text-[10px] font-mono ml-1 opacity-70 bg-primary/10 border-primary/20">
          Ctrl+N
        </kbd>
      </button>
      {/* Purchase entry is secondary on mobile — reachable via the bottom
          nav's "More" drawer — so it doesn't compete for space here. */}
      <button
        onClick={() => navigate({ to: "/purchase/new" })}
        className="hidden md:flex h-8 px-3 md:px-4 rounded-md bg-white/15 hover:bg-white/25 text-white font-semibold text-sm items-center gap-1.5 ring-1 ring-white/20 transition"
      >
        <Plus className="h-4 w-4" /> Add Purchase
        <kbd className="hidden md:inline-flex text-[10px] font-mono ml-1 opacity-80 bg-white/20 border-white/20 text-white">
          Ctrl+P
        </kbd>
      </button>

      <div className="hidden lg:block h-6 w-px bg-white/20 mx-1" />
      <span className="hidden lg:inline text-[11px] text-white/75 tabular-nums">{today}</span>

      {/* Company + Logout — desktop only. Logout lives in the sidebar
          drawer on mobile instead. */}
      <button
        onClick={() => navigate({ to: "/settings" })}
        className="hidden md:flex items-center gap-2 pl-2 pr-2 h-8 rounded-md bg-white/15 hover:bg-white/25 ring-1 ring-white/20 transition"
        title="Company settings"
      >
        <div className="h-6 w-6 rounded bg-white/20 flex items-center justify-center">
          <Building2 className="h-3.5 w-3.5" />
        </div>
        <div className="flex flex-col items-start leading-tight">
          <span className="text-[10px] uppercase tracking-wide opacity-75">Company</span>
          <span className="text-[12px] font-semibold truncate max-w-[140px]">
            {company.name}
          </span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>

      <button
        onClick={async () => {
          if (!confirm("Logout from BizDesk?")) return;
          try {
            stopRepos();
            await signOut(auth);
          } catch {
            toast.error("Logout failed — check your connection");
          }
        }}
        className="hidden md:flex h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 ring-1 ring-white/20 items-center justify-center transition"
        title={`Logout${isBrowser && auth.currentUser?.email ? ` (${auth.currentUser.email})` : ""}`}
      >
        <LogOut className="h-4 w-4" />
      </button>
    </header>
  );
}

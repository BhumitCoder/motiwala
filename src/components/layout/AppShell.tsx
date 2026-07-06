import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { MobileBottomNav } from "./MobileBottomNav";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";

export function AppShell({ children }: { children: ReactNode }) {
  useGlobalShortcuts();
  return (
    <div className="h-screen w-screen flex bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <WorkspaceTabs />
        <main className="flex-1 overflow-auto bg-[#f5f6fa] pb-[60px] md:pb-0">{children}</main>
      </div>
      <MobileBottomNav />
      <GlobalSearch />
    </div>
  );
}

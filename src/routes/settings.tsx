import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { CompanyRepo, REPO_BY_KEY } from "@/repositories";
import { Field } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { today } from "@/lib/format";
import { auth, isBrowser } from "@/lib/firebase";
import type { Company } from "@/types";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const [c, setC] = useState<Company>(() => CompanyRepo.get());
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const userEmail = isBrowser ? (auth.currentUser?.email ?? "") : "";

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    CompanyRepo.save(c);
    toast.success("Settings saved");
  };

  // Same file format as the old localStorage backups, so old backup files still restore
  const exportData = () => {
    const dump: Record<string, string> = {};
    for (const [key, repo] of Object.entries(REPO_BY_KEY)) {
      dump[key] = JSON.stringify(repo.all());
    }
    dump["bz.company"] = JSON.stringify(CompanyRepo.get());
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bizdesk-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded");
  };

  const importData = async (file: File) => {
    try {
      const dump = JSON.parse(await file.text());
      if (typeof dump !== "object" || dump === null) throw new Error("Invalid file");
      const known = Object.keys(REPO_BY_KEY).filter((k) => dump[k] != null);
      const hasCompany = dump["bz.company"] != null;
      if (!known.length && !hasCompany) {
        toast.error("No BizDesk data found in this file");
        return;
      }
      if (
        !confirm(
          `Restore ${known.length + (hasCompany ? 1 : 0)} data sections from backup into the cloud? Records with the same ID will be overwritten.`,
        )
      )
        return;
      setBusy(true);
      for (const k of known) {
        const v = dump[k];
        const records = typeof v === "string" ? JSON.parse(v) : v;
        if (Array.isArray(records) && records.length) {
          await REPO_BY_KEY[k].importAll(records);
        }
      }
      if (hasCompany) {
        const v = dump["bz.company"];
        CompanyRepo.save(typeof v === "string" ? JSON.parse(v) : v);
      }
      toast.success("Backup restored to cloud — reloading…");
      setTimeout(() => location.reload(), 800);
    } catch {
      setBusy(false);
      toast.error("Could not read backup file — is it a valid BizDesk backup?");
    }
  };

  const clearAll = async () => {
    if (!confirm("Delete ALL business data from the cloud? This cannot be undone.")) return;
    if (
      !confirm(
        "Are you really sure? Every invoice, party, item and payment will be permanently deleted.",
      )
    )
      return;
    setBusy(true);
    try {
      for (const repo of Object.values(REPO_BY_KEY)) {
        await repo.clearAll();
      }
      toast.success("All data cleared");
      setTimeout(() => location.reload(), 600);
    } catch {
      setBusy(false);
      toast.error("Could not clear all data — check your connection");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Settings" subtitle="Company & preferences" />
      <div className="p-4 space-y-6 overflow-auto max-w-3xl">
        <form onSubmit={save} className="border rounded-md bg-card p-4">
          <h2 className="font-semibold text-sm mb-3">Company Details</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field
                label="Company Name *"
                value={c.name}
                onChange={(e) => setC({ ...c, name: e.target.value })}
              />
            </div>
            <Field
              label="GSTIN"
              value={c.gstin ?? ""}
              onChange={(e) => setC({ ...c, gstin: e.target.value.toUpperCase() })}
            />
            <Field
              label="Phone"
              value={c.phone ?? ""}
              onChange={(e) => setC({ ...c, phone: e.target.value })}
            />
            <Field
              label="Email"
              value={c.email ?? ""}
              onChange={(e) => setC({ ...c, email: e.target.value })}
            />
            <Field
              label="Currency"
              value={c.currency}
              onChange={(e) => setC({ ...c, currency: e.target.value.toUpperCase() })}
            />
            <Field
              label="Invoice Prefix"
              value={c.invoicePrefix}
              onChange={(e) => setC({ ...c, invoicePrefix: e.target.value })}
            />
            <Field
              label="Purchase Prefix"
              value={c.purchasePrefix}
              onChange={(e) => setC({ ...c, purchasePrefix: e.target.value })}
            />
            <div className="col-span-2">
              <Field
                label="Address"
                value={c.address ?? ""}
                onChange={(e) => setC({ ...c, address: e.target.value })}
              />
            </div>
            <label className="col-span-2 flex items-center gap-2 text-[13px] cursor-pointer select-none mt-1">
              <input
                type="checkbox"
                checked={c.enableRoundOff !== false}
                onChange={(e) => setC({ ...c, enableRoundOff: e.target.checked })}
                className="accent-primary"
              />
              <span className="font-medium">Round off invoice totals to nearest rupee</span>
              <span className="text-xs text-muted-foreground">(e.g. ₹487.37 → ₹487)</span>
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="submit">
              Save <kbd className="ml-1 text-[10px]">Ctrl+S</kbd>
            </Button>
          </div>
        </form>

        <div className="border rounded-md bg-card p-4">
          <h2 className="font-semibold text-sm mb-3">Account & Data</h2>
          {userEmail && (
            <p className="text-xs text-muted-foreground mb-3">
              Signed in as <span className="font-semibold text-foreground">{userEmail}</span> · Data
              is stored securely in the cloud (Firebase) and works offline too.
            </p>
          )}
          <div className="flex gap-2 flex-wrap">
            <Button type="button" variant="outline" disabled={busy} onClick={exportData}>
              Export Backup (JSON)
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => importRef.current?.click()}
            >
              Import Backup
            </Button>
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importData(file);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="destructive" disabled={busy} onClick={clearAll}>
              Clear All Data
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Backups download as JSON files. Old backups from the localStorage version restore fine
            too.
          </p>
        </div>

        <div className="border rounded-md bg-card p-4">
          <h2 className="font-semibold text-sm mb-3">Keyboard Shortcuts</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            {[
              ["Ctrl+F", "Global search"],
              ["Ctrl+N", "New sale"],
              ["Ctrl+P", "New purchase"],
              ["Ctrl+S", "Save form"],
              ["Alt+1..8", "Jump to module"],
              ["N", "New record (in list)"],
              ["Tab / Enter", "Next field"],
              ["Shift+Tab", "Previous field"],
              ["Esc", "Close dialog / cancel"],
              ["↑ ↓", "Navigate rows / suggestions"],
              ["Enter", "Open / select"],
              ["Ctrl+Delete", "Delete row"],
            ].map(([k, l]) => (
              <div key={k} className="flex justify-between border-b py-1">
                <kbd>{k}</kbd>
                <span className="text-muted-foreground">{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

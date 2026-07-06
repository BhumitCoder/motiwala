import { useEffect, useRef, useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/Field";

export interface QuickAddPartyDetails {
  name: string;
  phone: string;
  openingBalance: number;
  gstin: string;
  creditLimit: number;
}

/**
 * Shown instead of silently auto-creating a party with blank defaults when a
 * name typed at the counter (Sale/Purchase/Return) doesn't match anyone on
 * file — asks for the real details up front so the party record isn't
 * missing phone/opening balance from day one.
 */
export function QuickAddPartyDialog({
  draft,
  isSale,
  onCancel,
  onConfirm,
}: {
  draft: { name: string; phone: string } | null;
  isSale: boolean;
  onCancel: () => void;
  onConfirm: (details: QuickAddPartyDetails) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [openingBalance, setOpeningBalance] = useState(0);
  const [gstin, setGstin] = useState("");
  const [creditLimit, setCreditLimit] = useState(0);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (draft) {
      setName(draft.name);
      setPhone(draft.phone);
      setOpeningBalance(0);
      setGstin("");
      setCreditLimit(0);
      setTimeout(() => firstRef.current?.focus(), 50);
    }
  }, [draft]);

  if (!draft) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    onConfirm({ name, phone, openingBalance, gstin, creditLimit });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            New {isSale ? "Customer" : "Supplier"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-muted-foreground -mt-2">
          "{draft.name}" isn't in your parties list yet — add their details to continue.
        </p>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field
              ref={firstRef}
              label="Name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Field
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="numeric"
          />
          <Field
            label="Opening Balance"
            type="number"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
          />
          <Field
            label="GSTIN"
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
          />
          <Field
            label="Credit Limit"
            type="number"
            value={creditLimit}
            onChange={(e) => setCreditLimit(parseFloat(e.target.value) || 0)}
          />
          <div className="col-span-2 flex justify-end gap-2 mt-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">Add & Continue</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import type { PaymentMode } from "@/types";

export const MODE_LABELS: Record<PaymentMode, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank",
  cheque: "Cheque",
  credit: "Credit",
};

/** "upi" → "UPI", "cash" → "Cash" — for lists, documents, reports */
export const fmtMode = (m: string) => MODE_LABELS[m as PaymentMode] ?? m;

/**
 * Theme-styled payment mode selector — pill buttons instead of the native
 * <select>, whose dropdown list can't be themed and looks foreign to the app.
 * One tap at the counter, active mode in brand color.
 */
export function ModePills({
  value,
  onChange,
  modes,
}: {
  value: PaymentMode;
  onChange: (m: PaymentMode) => void;
  modes: PaymentMode[];
}) {
  return (
    <div className="flex flex-wrap gap-1 justify-end">
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`px-2.5 h-7 rounded-full border text-[11px] font-semibold transition ${
            value === m
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
          }`}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

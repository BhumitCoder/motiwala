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
 *
 * Keyboard: the GROUP is one Tab stop (explicit tabindex — macOS Safari skips
 * plain buttons when Tabbing, which made the old per-button version
 * unreachable for Mac keyboard users). Arrow keys / digits 1-5 change the
 * mode, exactly like a native radio group.
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
  const cycle = (dir: 1 | -1) => {
    const i = Math.max(0, modes.indexOf(value));
    onChange(modes[(i + dir + modes.length) % modes.length]);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Payment mode"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          cycle(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          cycle(-1);
        } else if (/^[1-9]$/.test(e.key)) {
          const m = modes[parseInt(e.key, 10) - 1];
          if (m) {
            e.preventDefault();
            onChange(m);
          }
        }
      }}
      className="flex flex-wrap gap-1 justify-end rounded-lg p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          tabIndex={-1}
          onClick={() => onChange(m)}
          className={`px-2.5 h-7 rounded-full border text-[11px] font-semibold transition outline-none ${
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

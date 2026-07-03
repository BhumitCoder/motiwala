import type { Invoice, Company } from "@/types";
import { fmtMoney, fmtDate } from "@/lib/format";

/** Build a wa.me link; Indian 10-digit numbers get the 91 prefix. Returns null if no usable number. */
export function waLink(phone: string | undefined, text: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export function billMessage(inv: Invoice, company: Company): string {
  const lines = (inv.lineItems ?? [])
    .map((l) => `• ${l.name} — ${l.qty} ${l.unit} × ${fmtMoney(l.price)} = ${fmtMoney(l.amount)}`)
    .join("\n");
  const balance = Math.max(0, Math.round(((inv.total || 0) - (inv.paid || 0)) * 100) / 100);
  return [
    `*${company.name}*`,
    `Bill: *${inv.number}* · ${fmtDate(inv.date)}`,
    ``,
    lines,
    ``,
    `Total: *${fmtMoney(inv.total)}*`,
    `Paid: ${fmtMoney(inv.paid)}`,
    balance > 0 ? `Balance Due: *${fmtMoney(balance)}*` : `✅ Fully Paid`,
    ``,
    `Thank you for your business! 🙏`,
  ].join("\n");
}

export function reminderMessage(partyName: string, balance: number, company: Company): string {
  return [
    `Namaste ${partyName} 🙏`,
    ``,
    `This is a gentle reminder from *${company.name}*.`,
    `Your pending balance is *${fmtMoney(balance)}*.`,
    ``,
    `Kindly arrange the payment at your earliest convenience. Thank you!`,
  ].join("\n");
}

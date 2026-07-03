import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  PartyRepo,
  SalesRepo,
  PurchaseRepo,
  SaleReturnRepo,
  PurchaseReturnRepo,
  PaymentRepo,
  CompanyRepo,
} from "@/repositories";
import { paidViaPayments } from "@/lib/ledger";
import { fmtMoney, fmtDate } from "@/lib/format";
import { waLink, reminderMessage } from "@/lib/whatsapp";
import { printWithName } from "@/lib/print";
import { PartyDialog } from "./parties";
import type { Party } from "@/types";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Printer, MessageCircle, AlertCircle, Phone } from "lucide-react";

export const Route = createFileRoute("/parties_/$id")({ component: PartyStatementPage });

const r2 = (n: number) => Math.round(n * 100) / 100;

interface LedgerRow {
  date: string;
  created: string;
  type: string;
  ref: string;
  /** party owes more (sales, purchase returns, payments made to them) */
  debit: number;
  /** party owes less (payments received, sale returns, purchases from them) */
  credit: number;
  balance: number;
  /** underlying document id — makes the row clickable to open the bill */
  docId?: string;
  docKind?: "sale" | "purchase" | "sale-return" | "purchase-return";
}

function PartyStatementPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [party, setParty] = useState<Party | null | undefined>(undefined);
  const [editOpen, setEditOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    setParty(PartyRepo.get(id) ?? null);
  }, [id, refreshKey]);

  const { rows, fullBalance } = useMemo(() => {
    if (!party) return { rows: [] as LedgerRow[], fullBalance: 0 };
    const entries: Omit<LedgerRow, "balance">[] = [];
    const allPayments = PaymentRepo.all();
    const applied = paidViaPayments(allPayments);

    // Balance convention: positive = party owes us (receivable)
    for (const s of SalesRepo.all().filter((x) => x.partyId === party.id)) {
      entries.push({
        date: s.date,
        created: s.createdAt,
        type: "Sale",
        ref: s.number,
        debit: s.total,
        credit: 0,
        docId: s.id,
        docKind: "sale",
      });
      const atBilling = r2((s.paid || 0) - (applied.get(s.id) ?? 0));
      if (atBilling > 0) {
        entries.push({
          date: s.date,
          created: s.createdAt,
          type: "Received with bill",
          ref: s.number,
          debit: 0,
          credit: atBilling,
          docId: s.id,
          docKind: "sale",
        });
      }
    }
    for (const ret of SaleReturnRepo.all().filter((x) => x.partyId === party.id)) {
      entries.push({
        date: ret.date,
        created: ret.createdAt,
        type: "Sale Return",
        ref: ret.number,
        debit: 0,
        credit: ret.total,
        docId: ret.id,
        docKind: "sale-return",
      });
    }
    for (const p of PurchaseRepo.all().filter((x) => x.partyId === party.id)) {
      entries.push({
        date: p.date,
        created: p.createdAt,
        type: "Purchase",
        ref: p.number,
        debit: 0,
        credit: p.total,
        docId: p.id,
        docKind: "purchase",
      });
      const atBilling = r2((p.paid || 0) - (applied.get(p.id) ?? 0));
      if (atBilling > 0) {
        entries.push({
          date: p.date,
          created: p.createdAt,
          type: "Paid with bill",
          ref: p.number,
          debit: atBilling,
          credit: 0,
          docId: p.id,
          docKind: "purchase",
        });
      }
    }
    for (const ret of PurchaseReturnRepo.all().filter((x) => x.partyId === party.id)) {
      entries.push({
        date: ret.date,
        created: ret.createdAt,
        type: "Purchase Return",
        ref: ret.number,
        debit: ret.total,
        credit: 0,
        docId: ret.id,
        docKind: "purchase-return",
      });
    }
    for (const pay of allPayments.filter((x) => x.partyId === party.id)) {
      const linked = pay.allocations?.map((a) => a.number).join(", ") ?? pay.ref ?? "";
      if (pay.type === "in") {
        entries.push({
          date: pay.date,
          created: pay.createdAt,
          type: "Payment Received",
          ref: linked || "—",
          debit: 0,
          credit: pay.amount,
        });
      } else {
        entries.push({
          date: pay.date,
          created: pay.createdAt,
          type: "Payment Made",
          ref: linked || "—",
          debit: pay.amount,
          credit: 0,
        });
      }
    }

    entries.sort(
      (a, b) => a.date.localeCompare(b.date) || (a.created ?? "").localeCompare(b.created ?? ""),
    );

    // Current all-time balance, independent of any date filter
    const fullBalance = r2(
      entries.reduce((s, e) => s + e.debit - e.credit, party.openingBalance || 0),
    );

    let running = party.openingBalance || 0;
    const out: LedgerRow[] = [];

    // Date window: transactions before "From" collapse into one
    // "Balance b/f" (brought forward) line, like a proper ledger
    const before = dateFrom ? entries.filter((e) => e.date < dateFrom) : [];
    const window = entries.filter(
      (e) => (!dateFrom || e.date >= dateFrom) && (!dateTo || e.date <= dateTo),
    );
    for (const e of before) {
      running = r2(running + e.debit - e.credit);
    }

    if (dateFrom) {
      out.push({
        date: "",
        created: "",
        type: "Balance b/f",
        ref: "—",
        debit: 0,
        credit: 0,
        balance: running,
      });
    } else if (party.openingBalance) {
      out.push({
        date: "",
        created: "",
        type: "Opening Balance",
        ref: "—",
        debit: party.openingBalance > 0 ? party.openingBalance : 0,
        credit: party.openingBalance < 0 ? -party.openingBalance : 0,
        balance: running,
      });
    }
    for (const e of window) {
      running = r2(running + e.debit - e.credit);
      out.push({ ...e, balance: running });
    }
    return { rows: out, fullBalance };
  }, [party, refreshKey, dateFrom, dateTo]);

  const openRow = (e: LedgerRow) => {
    if (!e.docId || !e.docKind) return;
    if (e.docKind === "sale") navigate({ to: "/sales/$id", params: { id: e.docId } });
    else if (e.docKind === "purchase") navigate({ to: "/purchase/$id", params: { id: e.docId } });
    else if (e.docKind === "sale-return")
      navigate({ to: "/sale-return/$id", params: { id: e.docId } });
    else navigate({ to: "/purchase-return/$id", params: { id: e.docId } });
  };

  if (party === undefined) return null;
  if (party === null) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-gray-400">
        <AlertCircle className="h-12 w-12 text-gray-200" />
        <p className="font-medium">Party not found</p>
        <button
          onClick={() => navigate({ to: "/parties" })}
          className="text-sm text-primary hover:underline"
        >
          ← Back to Parties
        </button>
      </div>
    );
  }

  const balance = rows.length ? rows[rows.length - 1].balance : party.openingBalance || 0;
  const totalDebit = rows.reduce((s, e) => s + e.debit, 0);
  const totalCredit = rows.reduce((s, e) => s + e.credit, 0);

  const sendReminder = () => {
    // Reminder must always use the CURRENT full balance — never the balance
    // as of a filtered older period the user happens to be viewing
    const currentBalance = dateTo ? fullBalance : balance;
    if (currentBalance <= 0) {
      toast.info("No pending balance — nothing to remind");
      return;
    }
    const link = waLink(party.phone, reminderMessage(party.name, currentBalance, CompanyRepo.get()));
    if (!link) {
      toast.error("No phone number saved for this party");
      return;
    }
    window.open(link, "_blank");
  };

  return (
    <div className="flex flex-col h-full bg-[#f5f6fa]">
      {/* Header */}
      <div className="no-print bg-white border-b px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate({ to: "/parties" })}
            className="h-9 w-9 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 flex items-center justify-center text-gray-600 transition shadow-sm"
            title="Back to Parties"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-10 w-10 shrink-0 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold text-[15px] uppercase">
            {party.name.trim().charAt(0) || "?"}
          </div>
          <div className="min-w-0">
            <h1 className="text-[17px] font-bold text-gray-800 truncate leading-tight">
              {party.name}
            </h1>
            <p className="text-[12px] text-gray-400 flex items-center gap-1">
              {party.phone ? (
                <>
                  <Phone className="h-3 w-3" /> {party.phone}
                </>
              ) : (
                "No phone saved"
              )}
              <span className="text-gray-300">·</span>
              <span>Party Statement</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-md text-sm font-semibold hover:bg-gray-50 transition"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
          <button
            onClick={sendReminder}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-md text-sm font-semibold hover:bg-emerald-700 transition"
            title={
              balance > 0 ? `Send payment reminder for ${fmtMoney(balance)}` : "No pending balance"
            }
          >
            <MessageCircle className="h-4 w-4" /> Remind on WhatsApp
          </button>
          <button
            onClick={() => printWithName(`Statement-${party.name.replace(/\s+/g, "-")}`)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:opacity-90 transition"
            title="Print, or choose 'Save as PDF' in the print dialog"
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="no-print grid grid-cols-3 bg-white border-b">
        <div className="px-5 py-3.5 border-r border-gray-100">
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1">
            Total Debit
          </p>
          <p className="text-[20px] font-bold tabular-nums text-gray-800">{fmtMoney(totalDebit)}</p>
        </div>
        <div className="px-5 py-3.5 border-r border-gray-100">
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1">
            Total Credit
          </p>
          <p className="text-[20px] font-bold tabular-nums text-gray-800">
            {fmtMoney(totalCredit)}
          </p>
        </div>
        <div className="px-5 py-3.5">
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1">
            {balance > 0 ? "They Owe You" : balance < 0 ? "You Owe Them" : "Settled"}
          </p>
          <p
            className={`text-[20px] font-bold tabular-nums ${balance > 0 ? "text-rose-600" : balance < 0 ? "text-amber-600" : "text-emerald-600"}`}
          >
            {fmtMoney(Math.abs(balance))}
          </p>
        </div>
      </div>

      {/* Statement (also the printable area) */}
      <div className="flex-1 overflow-auto p-5">
        <div className="print-visible bg-white border rounded-lg shadow-sm overflow-hidden max-w-4xl mx-auto print:p-6">
          <div className="px-5 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
            <div>
            <p className="text-sm font-bold text-gray-800">Party Statement — {party.name}</p>
            <p className="text-[11px] text-gray-400">
              {CompanyRepo.get().name} · Generated {fmtDate(new Date().toISOString())} · Balance:{" "}
              {fmtMoney(Math.abs(balance))}{" "}
              {balance > 0 ? "receivable" : balance < 0 ? "payable" : ""}
            </p>
            </div>
            <div className="no-print flex items-center gap-1.5 text-xs text-gray-500">
              <span>From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-200 rounded-md text-xs px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <span>To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-200 rounded-md text-xs px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className="text-gray-400 hover:text-gray-600 font-semibold px-1"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {["Date", "Type", "Ref #", "Debit (+)", "Credit (−)", "Balance"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200 whitespace-nowrap ${i >= 3 ? "text-right" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-14 text-gray-400">
                    No transactions with this party yet
                  </td>
                </tr>
              ) : (
                rows.map((e, i) => (
                  <tr
                    key={i}
                    onClick={() => openRow(e)}
                    title={e.docId ? "Open this bill" : undefined}
                    className={`border-b border-gray-100 hover:bg-gray-50/60 ${e.docId ? "cursor-pointer" : ""}`}
                  >
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      {e.date ? fmtDate(e.date) : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{e.type}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-blue-600">{e.ref}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-rose-600">
                      {e.debit ? fmtMoney(e.debit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">
                      {e.credit ? fmtMoney(e.credit) : "—"}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums font-semibold ${e.balance > 0 ? "text-rose-600" : e.balance < 0 ? "text-amber-600" : "text-gray-500"}`}
                    >
                      {fmtMoney(Math.abs(e.balance))}
                      {e.balance !== 0 && (e.balance > 0 ? " Dr" : " Cr")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                  <td colSpan={3} className="px-4 py-3 text-xs uppercase text-gray-500">
                    Closing Balance
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-rose-600">
                    {fmtMoney(totalDebit)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-600">
                    {fmtMoney(totalCredit)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${balance > 0 ? "text-rose-600" : balance < 0 ? "text-amber-600" : "text-gray-600"}`}
                  >
                    {fmtMoney(Math.abs(balance))}
                    {balance !== 0 && (balance > 0 ? " Dr" : " Cr")}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <PartyDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        party={party}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}

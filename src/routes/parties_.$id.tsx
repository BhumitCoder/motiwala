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
import { buildPartyStatement, type PartyStatementRow } from "@/lib/ledger";
import { fmtMoney, fmtDate } from "@/lib/format";
import { printWithName } from "@/lib/print";
import { downloadXlsx } from "@/lib/xlsx";
import { partyStatementSheet } from "@/lib/partySheet";
import { PartyDialog } from "./parties";
import type { Party } from "@/types";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Printer,
  AlertCircle,
  Phone,
  Download,
  Receipt,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/parties_/$id")({ component: PartyStatementPage });

type LedgerRow = PartyStatementRow;

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

  const { rows } = useMemo(() => {
    if (!party) return { rows: [] as LedgerRow[], fullBalance: 0 };
    return buildPartyStatement(
      party,
      {
        sales: SalesRepo.all(),
        purchases: PurchaseRepo.all(),
        saleReturns: SaleReturnRepo.all(),
        purchaseReturns: PurchaseReturnRepo.all(),
        payments: PaymentRepo.all(),
      },
      dateFrom,
      dateTo,
    );
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
  const totalReceived = rows.reduce((s, e) => s + (e.total > 0 ? e.receivedOrPaid : 0), 0);
  const totalBilled = rows.reduce((s, e) => s + e.total, 0);

  // Vyapar-style ledger export — company/party header info, then one block
  // per transaction with its own item breakdown (matching what the client
  // asked for: the actual bill contents inside the statement, not just a
  // flat debit/credit line), then a closing balance. Reuses the exact rows
  // already shown on screen so the download always matches what's visible.
  const downloadExcel = () => {
    const company = CompanyRepo.get();
    const periodLabel = `${dateFrom ? fmtDate(dateFrom) : "Beginning"} to ${dateTo ? fmtDate(dateTo) : "Today"}`;
    // Real .xlsx via the same builder the Party Ledger report uses — proper
    // column widths and numeric amount cells (the old CSV version opened
    // with every column truncated in Excel/WPS/Numbers)
    downloadXlsx(`Statement-${party.name}`, [
      partyStatementSheet(party, rows, company, periodLabel),
    ]);
    toast.success("Statement downloaded as Excel");
  };

  return (
    <div className="flex flex-col h-full bg-[#f5f6fa]">
      {/* Header */}
      <div className="no-print bg-white border-b px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => navigate({ to: "/parties" })}
            className="h-8 w-8 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 flex items-center justify-center text-gray-600 transition shadow-sm"
            title="Back to Parties"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-8 w-8 shrink-0 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold text-[13px] uppercase">
            {party.name.trim().charAt(0) || "?"}
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-gray-800 truncate leading-tight">
              {party.name}
            </h1>
            <p className="text-[11px] text-gray-400 flex items-center gap-1 whitespace-nowrap">
              {party.phone ? (
                <>
                  <Phone className="h-3 w-3" /> {party.phone}
                </>
              ) : (
                "No phone saved"
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <StatementCard icon={Receipt} label="Total Billed" value={totalBilled} tone="gray" />
          <StatementCard icon={CheckCircle2} label="Received / Paid" value={totalReceived} tone="emerald" />
          <StatementCard
            icon={AlertCircle}
            label={balance > 0 ? "They Owe You" : balance < 0 ? "You Owe Them" : "Settled"}
            value={Math.abs(balance)}
            tone={balance > 0 ? "rose" : balance < 0 ? "amber" : "emerald"}
          />
          <button
            onClick={() => setEditOpen(true)}
            className="h-8 w-8 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex items-center justify-center transition"
            title="Edit party"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={downloadExcel}
            className="h-8 w-8 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex items-center justify-center transition"
            title="Download full ledger as Excel/CSV"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={() => printWithName(`Statement-${party.name.replace(/\s+/g, "-")}`)}
            className="inline-flex items-center gap-1.5 h-8 px-3 bg-primary text-white rounded-md text-sm font-semibold hover:opacity-90 transition"
            title="Print, or choose 'Save as PDF' in the print dialog"
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
        </div>
      </div>

      {/* Statement (also the printable area) */}
      <div className="flex-1 overflow-auto p-5">
        <div className="print-visible bg-white border rounded-lg shadow-sm max-w-6xl mx-auto">
          {/* The statement is 9 columns wide plus a nested item table — too
              wide for portrait A4, so it gets cut off at the right edge on
              print/PDF. Landscape gives it enough width to fit. */}
          <style>{`@media print { @page { size: A4 landscape; margin: 12mm; } }`}</style>
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
          <div className="overflow-x-auto rounded-b-lg">
            <table className="w-full text-[12px] border-collapse min-w-[980px]">
              <thead>
                <tr className="bg-gray-50">
                  {[
                    "Date",
                    "Txn Type",
                    "Ref No.",
                    "Payment Status",
                    "Total",
                    "Received/Paid",
                    "Txn Balance",
                    "Receivable Balance",
                    "Payable Balance",
                  ].map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200 whitespace-nowrap ${i >= 4 ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-14 text-gray-400">
                      No transactions with this party yet
                    </td>
                  </tr>
                ) : (
                  rows.map((e, i) => (
                    <PartyStatementRowBlock key={i} row={e} onOpen={() => openRow(e)} />
                  ))
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                    <td colSpan={7} className="px-3 py-3 text-xs uppercase text-gray-500">
                      Closing Balance
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-rose-600">
                      {balance > 0 ? fmtMoney(balance) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-amber-600">
                      {balance < 0 ? fmtMoney(-balance) : "—"}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
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

const STATEMENT_TONES = {
  gray: { bg: "bg-gray-100", text: "text-gray-700" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  rose: { bg: "bg-rose-50", text: "text-rose-600" },
  amber: { bg: "bg-amber-50", text: "text-amber-600" },
} as const;

function StatementCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: keyof typeof STATEMENT_TONES;
}) {
  const t = STATEMENT_TONES[tone];
  return (
    <div className="shrink-0 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border border-gray-100 bg-white">
      <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${t.bg} ${t.text}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5 whitespace-nowrap">
          {label}
        </p>
        <p className={`text-[14px] font-bold tabular-nums whitespace-nowrap ${t.text}`}>
          {fmtMoney(value)}
        </p>
      </div>
    </div>
  );
}

/** One transaction's summary row, plus — for Sale/Purchase/Returns — a
 * nested item breakdown underneath, matching what the client's reference
 * statement (Vyapar) shows: not just a ledger line, but what was actually
 * in the bill. */
export function PartyStatementRowBlock({
  row: e,
  onOpen,
}: {
  row: PartyStatementRow;
  onOpen: () => void;
}) {
  const itemSubtotal = e.items?.reduce((s, it) => s + it.amount, 0) ?? 0;
  return (
    <>
      <tr
        onClick={onOpen}
        title={e.docId ? "Open this bill" : undefined}
        className={`border-b border-gray-100 hover:bg-gray-50/60 ${e.docId ? "cursor-pointer" : ""} ${e.type === "Beginning Balance" || e.type === "Balance b/f" ? "bg-gray-50/40 font-semibold" : ""}`}
        style={{
          breakInside: "avoid",
          breakAfter: e.items?.length ? "avoid" : undefined,
        }}
      >
        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
          {e.date ? fmtDate(e.date) : ""}
        </td>
        <td className="px-3 py-2.5 font-medium text-gray-800 whitespace-nowrap">{e.type}</td>
        <td className="px-3 py-2.5 font-mono text-xs text-blue-600 whitespace-nowrap">{e.ref}</td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          {e.status && (
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                e.status === "Paid"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : e.status === "Partial"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-rose-50 text-rose-700 border-rose-200"
              }`}
            >
              {e.status}
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
          {e.total ? fmtMoney(e.total) : "—"}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 whitespace-nowrap">
          {e.receivedOrPaid ? fmtMoney(e.receivedOrPaid) : "—"}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-rose-600 whitespace-nowrap">
          {e.txnBalance ? fmtMoney(e.txnBalance) : "—"}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-rose-600 whitespace-nowrap">
          {e.balance > 0 ? fmtMoney(e.balance) : "—"}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-amber-600 whitespace-nowrap">
          {e.balance < 0 ? fmtMoney(-e.balance) : "—"}
        </td>
      </tr>
      {!!e.items?.length && (
        <tr className="border-b border-gray-100 bg-gray-50/30" style={{ breakInside: "avoid", breakBefore: "avoid" }}>
          <td colSpan={9} className="px-3 pb-3 pt-1">
            <table className="w-full text-[11.5px] border-collapse bg-white border rounded-md overflow-hidden">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold uppercase text-gray-500 w-8">
                    #
                  </th>
                  <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold uppercase text-gray-500">
                    Item name
                  </th>
                  <th className="text-right px-2.5 py-1.5 text-[10px] font-semibold uppercase text-gray-500 w-20">
                    Quantity
                  </th>
                  <th className="text-right px-2.5 py-1.5 text-[10px] font-semibold uppercase text-gray-500 w-24">
                    Price/Unit
                  </th>
                  <th className="text-right px-2.5 py-1.5 text-[10px] font-semibold uppercase text-gray-500 w-24">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {e.items.map((it, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2.5 py-1.5 text-gray-400">{i + 1}</td>
                    <td className="px-2.5 py-1.5 text-gray-800">{it.name}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{it.qty}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtMoney(it.price)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtMoney(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 font-semibold bg-gray-50">
                  <td colSpan={4} className="px-2.5 py-1.5 text-right text-gray-500 uppercase text-[10px]">
                    Sub Total
                  </td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtMoney(itemSubtotal)}</td>
                </tr>
                {(e.charges ?? []).map((c, i) => (
                  <tr key={i} className="border-t border-gray-100 text-gray-500">
                    <td colSpan={4} className="px-2.5 py-1 text-right uppercase text-[10px]">
                      {c.label}
                    </td>
                    <td className="px-2.5 py-1 text-right tabular-nums">
                      {c.amount < 0 ? `−${fmtMoney(-c.amount)}` : fmtMoney(c.amount)}
                    </td>
                  </tr>
                ))}
              </tfoot>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

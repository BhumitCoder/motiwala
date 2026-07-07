import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SalesRepo, PartyRepo, ItemRepo, PaymentRepo, BankRepo } from "@/repositories";
import { newBatch, commitBatch } from "@/repositories/base";
import type { Invoice } from "@/types";
import { fmtMoney, fmtDate, ymd, today } from "@/lib/format";
import {
  Plus,
  Search,
  X,
  ChevronDown,
  FileText,
  Trash2,
  Pencil,
  Receipt,
  CheckCircle2,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { usePagination, PaginationBar } from "@/components/Pagination";
import { fmtMode } from "@/components/ModePills";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/sales/")({ component: SalesPage });

type Status = "all" | "paid" | "partial" | "unpaid";

// Computed per mount (NOT module constants) — a tab left open overnight
// would otherwise keep filtering on yesterday's date and hide new bills
const monthStart = () => ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

function SalesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [parties, setParties] = useState<{ id: string; name: string }[]>([]);
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [partyId, setPartyId] = useState("all");
  const [status, setStatus] = useState<Status>("all");
  const [search, setSearch] = useState("");
  const [showPartyDrop, setShowPartyDrop] = useState(false);
  const [partyDropQ, setPartyDropQ] = useState("");

  const refresh = () => {
    setRows(SalesRepo.all());
    setParties(PartyRepo.all().map((p) => ({ id: p.id, name: p.name })));
  };
  useEffect(refresh, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      if (partyId !== "all" && r.partyId !== partyId) return false;
      if (status !== "all") {
        const bal = Math.round((r.total - r.paid) * 100) / 100;
        if (status === "paid" && bal > 0) return false;
        if (status === "unpaid" && r.paid > 0) return false;
        if (status === "partial" && (r.paid === 0 || bal <= 0)) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!r.number.toLowerCase().includes(q) && !r.partyName.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [rows, dateFrom, dateTo, partyId, status, search]);

  const pg = usePagination(filtered);
  const totalAmount = filtered.reduce((a, r) => a + r.total, 0);
  const totalPaid = filtered.reduce((a, r) => a + r.paid, 0);
  const totalBalance = filtered.reduce((a, r) => a + Math.max(0, r.total - r.paid), 0);
  const paidCount = filtered.filter((r) => r.total - r.paid <= 0).length;
  const unpaidCount = filtered.filter((r) => r.paid === 0 && r.total > 0).length;
  const partialCount = filtered.filter((r) => r.paid > 0 && r.total - r.paid > 0).length;

  const selectedParty = parties.find((p) => p.id === partyId);

  // Local search over the dropdown only — must never overwrite `parties`
  // itself, or the master list (used for `selectedParty` lookup and "All
  // Customers") gets stuck as whatever subset was last typed/searched.
  const filteredDropdownParties = useMemo(() => {
    const q = partyDropQ.trim().toLowerCase();
    return q ? parties.filter((p) => p.name.toLowerCase().includes(q)) : parties;
  }, [parties, partyDropQ]);

  const clearFilters = () => {
    setDateFrom(monthStart());
    setDateTo(today());
    setPartyId("all");
    setStatus("all");
    setSearch("");
  };
  const filtersActive =
    dateFrom !== monthStart() ||
    dateTo !== today() ||
    partyId !== "all" ||
    status !== "all" ||
    search !== "";

  const handleDelete = (r: Invoice) => {
    if (
      !confirm(
        `Delete invoice ${r.number}? Sold quantities will be added back to stock, and any payments applied to it will become advance payments.`,
      )
    )
      return;
    // Stock restore, payment unlinking, and the invoice delete must land
    // together — a shared batch commits them as one atomic Firestore write.
    const batch = newBatch();
    // Reverse the stock deduction this sale made
    for (const l of r.lineItems) {
      const it = ItemRepo.get(l.itemId);
      if (it) ItemRepo.adjustFieldBatched(batch, it.id, "stock", l.qty);
    }
    // Payments applied to this invoice: unlink them so the money stays
    // counted as an advance instead of silently disappearing
    for (const p of PaymentRepo.all()) {
      if (p.allocations?.some((a) => a.invoiceId === r.id)) {
        const remaining = p.allocations.filter((a) => a.invoiceId !== r.id);
        PaymentRepo.updateBatched(batch, p.id, {
          allocations: remaining.length ? remaining : undefined,
        });
      }
    }
    // Undo whatever this sale moved on a specific bank account at billing
    // time, or that account's balance stays permanently wrong after delete.
    if (r.paymentMode === "bank" && r.bankId && (r.bankPaidAmount ?? 0) > 0) {
      BankRepo.adjustFieldBatched(batch, r.bankId, "balance", -r.bankPaidAmount!);
    }
    SalesRepo.removeBatched(batch, r.id);
    commitBatch(batch, "delete sale");
    refresh();
    toast.success("Invoice deleted — stock restored");
  };

  const STATUSES: { value: Status; label: string }[] = [
    { value: "all", label: "All" },
    { value: "paid", label: "Paid" },
    { value: "partial", label: "Partial" },
    { value: "unpaid", label: "Unpaid" },
  ];

  return (
    <div className="flex flex-col h-full bg-[#f5f6fa]">
      <PageHeader
        title="Sales"
        subtitle={`${filtered.length} of ${rows.length} invoices`}
        icon={<Receipt className="h-5 w-5" />}
        iconClassName="bg-success-soft text-success"
        actions={
          <>
            <SalesCard icon={Receipt} label="Total Sale" value={totalAmount} tone="gray" />
            <SalesCard icon={CheckCircle2} label="Total Paid" value={totalPaid} tone="emerald" />
            <SalesCard icon={AlertCircle} label="Total Receivable" value={totalBalance} tone="rose" />
            <button
              onClick={() => navigate({ to: "/sales/new" })}
              className="inline-flex items-center gap-1.5 h-8 px-4 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:opacity-90 transition"
            >
              <Plus className="h-4 w-4" /> Add Sale
              <kbd className="ml-1 text-[10px] bg-white/20 px-1.5 py-0.5 rounded">Ctrl+N</kbd>
            </button>
          </>
        }
      />

      {/* Filters */}
      <div className="bg-white border-b px-5 py-3 flex flex-wrap items-center gap-3">
        {/* Date range */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-md text-xs px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <label className="text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-md text-xs px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        {/* Party filter */}
        <div className="relative">
          <button
            onClick={() => setShowPartyDrop((v) => !v)}
            className="flex items-center gap-2 border border-gray-200 rounded-md text-xs px-3 py-1.5 text-gray-700 bg-white hover:bg-gray-50 transition min-w-[150px]"
          >
            <span className="flex-1 text-left truncate">
              {selectedParty ? selectedParty.name : "All Customers"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          </button>
          {showPartyDrop && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 w-56 max-h-64 overflow-auto">
              <div className="p-2 border-b">
                <input
                  autoFocus
                  placeholder="Search customer..."
                  value={partyDropQ}
                  className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none"
                  onChange={(e) => setPartyDropQ(e.target.value)}
                />
              </div>
              <button
                onClick={() => {
                  setPartyId("all");
                  setShowPartyDrop(false);
                  setPartyDropQ("");
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 ${partyId === "all" ? "text-blue-600 font-semibold bg-blue-50" : "text-gray-700"}`}
              >
                All Customers
              </button>
              {filteredDropdownParties.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPartyId(p.id);
                    setShowPartyDrop(false);
                    setPartyDropQ("");
                  }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 truncate ${partyId === p.id ? "text-blue-600 font-semibold bg-blue-50" : "text-gray-700"}`}
                >
                  {p.name}
                </button>
              ))}
              {filteredDropdownParties.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-3">No customers found</p>
              )}
            </div>
          )}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-0.5 border border-gray-200 rounded-md p-0.5 bg-white">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`px-2.5 py-1 rounded text-xs transition outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${status === s.value ? "bg-primary text-primary-foreground font-semibold" : "text-gray-500 hover:bg-gray-50"}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-1.5 border border-gray-200 rounded-md px-2.5 py-1.5 bg-white flex-1 min-w-[180px] max-w-xs">
          <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice, customer..."
            className="text-xs flex-1 outline-none text-gray-700 placeholder-gray-400 bg-transparent"
          />
          {search && (
            <button onClick={() => setSearch("")}>
              <X className="h-3 w-3 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>

        {filtersActive && (
          <button
            onClick={clearFilters}
            className="text-xs text-gray-400 hover:text-gray-600 transition flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Mobile card list — a table of 10 columns doesn't fit a phone;
          this is the same data as one tappable card per invoice instead. */}
      <div className="md:hidden flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FileText className="h-10 w-10 mx-auto mb-3 text-gray-200" />
            <p className="font-medium">No invoices found</p>
            <p className="text-xs mt-1">Try adjusting filters or add a new sale</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pg.paged.map((r) => {
              const balance = Math.round((r.total - r.paid) * 100) / 100;
              const isPaid = balance <= 0;
              const isUnpaid = r.paid === 0 && r.total > 0;
              const isPartial = r.paid > 0 && balance > 0;
              return (
                <div
                  key={r.id}
                  onClick={() => navigate({ to: "/sales/$id", params: { id: r.id } })}
                  className="bg-white p-4 active:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 truncate">{r.partyName}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">
                        {r.number} · {fmtDate(r.date)}
                      </p>
                    </div>
                    <p className="font-bold text-gray-800 tabular-nums shrink-0">
                      {fmtMoney(r.total)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge paid={isPaid} partial={isPartial} unpaid={isUnpaid} />
                      <span className="text-[11px] text-gray-400">{fmtMode(r.paymentMode)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {balance > 0 && (
                        <span className="text-xs font-semibold text-rose-600 mr-1">
                          Due {fmtMoney(balance)}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate({ to: "/sales/edit/$id", params: { id: r.id } });
                        }}
                        className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"
                        title="Edit invoice"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(r);
                        }}
                        className="p-1.5 rounded hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition"
                        title="Delete invoice"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Table (desktop) */}
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="w-full min-w-[960px] text-[13px] border-collapse">
          <thead className="sticky top-0 bg-white border-b z-10">
            <tr>
              <Th>Invoice #</Th>
              <Th>Date</Th>
              <Th>Customer</Th>
              <Th align="right">Items</Th>
              <Th align="right">Total Amount</Th>
              <Th align="right">Paid</Th>
              <Th align="right">Balance</Th>
              <Th>Status</Th>
              <Th>Mode</Th>
              <Th align="center">Action</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-16 text-gray-400">
                  <FileText className="h-10 w-10 mx-auto mb-3 text-gray-200" />
                  <p className="font-medium">No invoices found</p>
                  <p className="text-xs mt-1">Try adjusting filters or add a new sale</p>
                </td>
              </tr>
            ) : (
              pg.paged.map((r) => {
                const balance = Math.round((r.total - r.paid) * 100) / 100;
                const isPaid = balance <= 0;
                const isUnpaid = r.paid === 0 && r.total > 0;
                const isPartial = r.paid > 0 && balance > 0;
                return (
                  <tr
                    key={r.id}
                    onClick={() => navigate({ to: "/sales/$id", params: { id: r.id } })}
                    className="border-b border-gray-100 hover:bg-primary/5 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-blue-600 text-xs">
                      {r.number}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-[160px] truncate">
                      {r.partyName}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{r.lineItems.length}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800 tabular-nums">
                      {fmtMoney(r.total)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium tabular-nums">
                      {fmtMoney(r.paid)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span
                        className={balance > 0 ? "text-rose-600 font-semibold" : "text-gray-400"}
                      >
                        {fmtMoney(Math.max(0, balance))}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge paid={isPaid} partial={isPartial} unpaid={isUnpaid} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtMode(r.paymentMode)}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate({ to: "/sales/edit/$id", params: { id: r.id } });
                        }}
                        className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"
                        title="Edit invoice"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(r);
                        }}
                        className="p-1 rounded hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition"
                        title="Delete invoice"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="sticky bottom-0 bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide"
                >
                  Total ({filtered.length} invoices)
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-800 tabular-nums text-sm">
                  {fmtMoney(totalAmount)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums text-sm">
                  {fmtMoney(totalPaid)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-rose-600 tabular-nums text-sm">
                  {fmtMoney(totalBalance)}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <PaginationBar
        page={pg.page}
        totalPages={pg.totalPages}
        pageSize={pg.pageSize}
        total={pg.total}
        onPage={pg.setPage}
        onPageSize={pg.setPageSize}
      />
    </div>
  );
}

const SALES_TONES = {
  gray: { bg: "bg-gray-100", text: "text-gray-700" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  rose: { bg: "bg-rose-50", text: "text-rose-600" },
} as const;

function SalesCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: keyof typeof SALES_TONES;
}) {
  const t = SALES_TONES[tone];
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

function StatusBadge({
  paid,
  partial,
  unpaid,
}: {
  paid: boolean;
  partial: boolean;
  unpaid: boolean;
}) {
  if (paid)
    return (
      <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
        Paid
      </span>
    );
  if (partial)
    return (
      <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
        Partial
      </span>
    );
  if (unpaid)
    return (
      <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
        Unpaid
      </span>
    );
  return null;
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 whitespace-nowrap bg-white"
      style={{ textAlign: align ?? "left" }}
    >
      {children}
    </th>
  );
}

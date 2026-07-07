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
} from "lucide-react";
import { toast } from "sonner";
import { usePagination, PaginationBar } from "@/components/Pagination";
import { DataTable } from "@/components/DataTable";
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
        iconClassName="text-success"
        actions={
          <>
            {/* Date range */}
            <div className="flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-lg border border-gray-200 bg-gray-50/60">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-transparent text-xs text-gray-700 focus:outline-none w-[104px]"
              />
              <span className="text-gray-300 text-xs">–</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-transparent text-xs text-gray-700 focus:outline-none w-[104px]"
              />
            </div>

            {/* Party filter */}
            <div className="relative">
              <button
                onClick={() => setShowPartyDrop((v) => !v)}
                className="flex items-center gap-2 h-9 border border-gray-200 rounded-lg text-xs px-3 text-gray-700 bg-gray-50/60 hover:bg-gray-100 transition min-w-[140px]"
              >
                <span className="flex-1 text-left truncate">
                  {selectedParty ? selectedParty.name : "All Customers"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              </button>
              {showPartyDrop && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 w-56 max-h-64 overflow-auto">
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
            <div className="flex items-center gap-0.5 h-9 border border-gray-200 rounded-lg p-0.5 bg-gray-50/60">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={`px-2.5 h-7 rounded-md text-xs transition outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${status === s.value ? "bg-primary text-primary-foreground font-semibold" : "text-gray-500 hover:bg-gray-100"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-48">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search invoice, customer..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 bg-gray-50/60 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition"
              />
            </div>

            {filtersActive && (
              <button
                onClick={clearFilters}
                className="text-xs text-gray-400 hover:text-gray-600 transition flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}

            <button
              onClick={() => navigate({ to: "/sales/new" })}
              className="inline-flex items-center gap-1.5 h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition"
            >
              <Plus className="h-4 w-4" /> Add Sale
            </button>
          </>
        }
      />

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
      <div className="hidden md:flex flex-1 min-h-0 p-6">
        <DataTable
          activateOnClick
          columns={[
            {
              key: "number",
              label: "Invoice #",
              render: (r) => <span className="font-mono">{r.number}</span>,
              sortValue: (r) => r.number,
            },
            { key: "date", label: "Date", render: (r) => fmtDate(r.date), sortValue: (r) => r.date },
            {
              key: "customer",
              label: "Customer",
              render: (r) => <span className="max-w-[160px] truncate block">{r.partyName}</span>,
              sortValue: (r) => r.partyName,
            },
            {
              key: "items",
              label: "Items",
              align: "right",
              render: (r) => r.lineItems.length,
              sortValue: (r) => r.lineItems.length,
            },
            {
              key: "total",
              label: "Total Amount",
              align: "right",
              render: (r) => <span className="tabular-nums">{fmtMoney(r.total)}</span>,
              sortValue: (r) => r.total,
            },
            {
              key: "paid",
              label: "Paid",
              align: "right",
              render: (r) => <span className="tabular-nums">{fmtMoney(r.paid)}</span>,
              sortValue: (r) => r.paid,
            },
            {
              key: "balance",
              label: "Balance",
              align: "right",
              render: (r) => {
                const balance = Math.round((r.total - r.paid) * 100) / 100;
                return (
                  <span className="tabular-nums">
                    {fmtMoney(Math.max(0, balance))}
                  </span>
                );
              },
              sortValue: (r) => Math.max(0, Math.round((r.total - r.paid) * 100) / 100),
            },
            {
              key: "status",
              label: "Status",
              render: (r) => {
                const balance = Math.round((r.total - r.paid) * 100) / 100;
                return (
                  <StatusBadge
                    paid={balance <= 0}
                    partial={r.paid > 0 && balance > 0}
                    unpaid={r.paid === 0 && r.total > 0}
                  />
                );
              },
            },
            {
              key: "mode",
              label: "Mode",
              render: (r) => fmtMode(r.paymentMode),
            },
            {
              key: "action",
              label: "Action",
              align: "center",
              render: (r) => (
                <span className="whitespace-nowrap">
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
                </span>
              ),
            },
          ]}
          rows={filtered}
          rowKey={(r) => r.id}
          onRowActivate={(r) => navigate({ to: "/sales/$id", params: { id: r.id } })}
          emptyMessage="No invoices found — try adjusting filters or add a new sale"
          footer={
            <tr>
              <td colSpan={4}>Total ({filtered.length} invoices)</td>
              <td className="text-right tabular-nums">{fmtMoney(totalAmount)}</td>
              <td className="text-right tabular-nums">{fmtMoney(totalPaid)}</td>
              <td className="text-right tabular-nums">{fmtMoney(totalBalance)}</td>
              <td colSpan={3} />
            </tr>
          }
        />
      </div>
      <div className="md:hidden">
        <PaginationBar
          page={pg.page}
          totalPages={pg.totalPages}
          pageSize={pg.pageSize}
          total={pg.total}
          onPage={pg.setPage}
          onPageSize={pg.setPageSize}
        />
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
  if (paid) return "Paid";
  if (partial) return "Partial";
  if (unpaid) return "Unpaid";
  return null;
}


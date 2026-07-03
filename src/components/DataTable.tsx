import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePagination, PaginationBar } from "@/components/Pagination";

export interface Column<T> {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowActivate?: (row: T) => void;
  onDelete?: (row: T) => void;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowActivate,
  onDelete,
  emptyMessage,
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);

  const sorted = [...rows];
  if (sortKey) {
    const col = columns.find((c) => c.key === sortKey);
    if (col?.sortValue) {
      sorted.sort((a, b) => {
        const av = col.sortValue!(a);
        const bv = col.sortValue!(b);
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
  }

  const pg = usePagination(sorted);
  const paged = pg.paged;

  useEffect(() => {
    if (selectedIdx >= paged.length) setSelectedIdx(Math.max(0, paged.length - 1));
  }, [paged.length, selectedIdx]);

  // The "selected" row is tracked by numeric index into `paged` — if that
  // index isn't reset when the row order/page changes, keyboard actions
  // (Enter, Ctrl+Delete) silently act on whatever record now sits at the
  // same position instead of the row the user actually selected.
  useEffect(() => {
    setSelectedIdx(0);
  }, [sortKey, sortDir, pg.page]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(paged.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = paged[selectedIdx];
      if (row) onRowActivate?.(row);
    } else if (e.key === "Delete" && e.ctrlKey) {
      e.preventDefault();
      const row = paged[selectedIdx];
      if (row) onDelete?.(row);
    }
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col border rounded-md bg-card overflow-hidden">
      <div
        ref={tableRef}
        tabIndex={0}
        onKeyDown={onKey}
        className="data-table flex-1 overflow-auto outline-none"
      >
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width, textAlign: c.align ?? "left" }}
                  onClick={() => c.sortValue && toggleSort(c.key)}
                  className={cn(c.sortValue && "cursor-pointer select-none")}
                >
                  {c.label}
                  {sortKey === c.key && (
                    <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                  {emptyMessage ?? "No data. Press N to add."}
                </td>
              </tr>
            ) : (
              paged.map((row, i) => (
                <tr
                  key={rowKey(row)}
                  data-selected={i === selectedIdx}
                  onClick={() => setSelectedIdx(i)}
                  onDoubleClick={() => onRowActivate?.(row)}
                  className="cursor-pointer"
                >
                  {columns.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align ?? "left" }}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
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

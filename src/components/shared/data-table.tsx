"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  sortAccessor?: (row: T) => string | number | null | undefined;
  align?: "left" | "right";
  className?: string;
};

export type DataTableFacet<T> = {
  label: string;
  options: { value: string; label: string }[];
  matches: (row: T, value: string) => boolean;
};

type DataTableProps<T> = {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  searchText: (row: T) => string;
  searchPlaceholder?: string;
  facet?: DataTableFacet<T>;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void | Promise<void>;
  deleteLabel?: (row: T) => string;
  /**
   * Extra per-row menu items rendered between Edit and Delete in the kebab.
   * Caller supplies `<DropdownMenuItem>` children, or null to omit for a row.
   */
  rowActions?: (row: T) => React.ReactNode;
  pageSize?: number;
  toolbar?: React.ReactNode;
  emptyState: React.ReactNode;
};

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  searchText,
  searchPlaceholder = "Search…",
  facet,
  onEdit,
  onDelete,
  deleteLabel,
  rowActions,
  pageSize = 10,
  toolbar,
  emptyState,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [facetValue, setFacetValue] = useState("all");
  const [sort, setSort] = useState<{ id: string; dir: "asc" | "desc" } | null>(
    null,
  );
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const hasActions = Boolean(onEdit || onDelete || rowActions);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery = q ? searchText(row).toLowerCase().includes(q) : true;
      const matchesFacet =
        facet && facetValue !== "all" ? facet.matches(row, facetValue) : true;
      return matchesQuery && matchesFacet;
    });
  }, [rows, query, facet, facetValue, searchText]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const column = columns.find((c) => c.id === sort.id);
    if (!column?.sortAccessor) return filtered;
    const accessor = column.sortAccessor;
    return [...filtered].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function toggleSort(id: string) {
    setPage(0);
    setSort((prev) => {
      if (prev?.id !== id) return { id, dir: "asc" };
      if (prev.dir === "asc") return { id, dir: "desc" };
      return null;
    });
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        {toolbar ? <div className="flex justify-end">{toolbar}</div> : null}
        {emptyState}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder={searchPlaceholder}
            className="pl-8"
          />
        </div>
        {facet ? (
          <Select
            value={facetValue}
            onValueChange={(v) => {
              setFacetValue(v ?? "all");
              setPage(0);
            }}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder={facet.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {facet.label.toLowerCase()}</SelectItem>
              {facet.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {toolbar ? <div className="sm:ml-auto">{toolbar}</div> : null}
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={cn(
                    column.align === "right" && "text-right",
                    column.className,
                  )}
                >
                  {column.sortAccessor ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.id)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {column.header}
                      {sort?.id === column.id ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="size-3.5" />
                        ) : (
                          <ArrowDown className="size-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3.5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              ))}
              {hasActions ? (
                <TableHead className="w-12 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (hasActions ? 1 : 0)}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No results match your filters.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={getRowId(row)}>
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      className={cn(
                        column.align === "right" && "text-right",
                        column.className,
                      )}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                  {hasActions ? (
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" />
                          }
                        >
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Open actions</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {onEdit ? (
                            <DropdownMenuItem onClick={() => onEdit(row)}>
                              <Pencil className="size-4" />
                              Edit
                            </DropdownMenuItem>
                          ) : null}
                          {rowActions ? rowActions(row) : null}
                          {onDelete ? (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteTarget(row)}
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {sorted.length} {sorted.length === 1 ? "result" : "results"}
        </span>
        {pageCount > 1 ? (
          <div className="flex items-center gap-2">
            <span>
              Page {safePage + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft className="size-4" />
              <span className="sr-only">Previous page</span>
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight className="size-4" />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        ) : null}
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteLabel
                ? `"${deleteLabel(deleteTarget)}" will be permanently removed. This cannot be undone.`
                : "This record will be permanently removed. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const target = deleteTarget;
                setDeleteTarget(null);
                if (target && onDelete) await onDelete(target);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

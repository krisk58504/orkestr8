"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Star, Wrench } from "lucide-react";
import { toast } from "sonner";
import { deleteVendor } from "@/app/(app)/vendors/actions";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { VENDOR_STATUS_META } from "@/lib/constants";
import type { Vendor } from "@/lib/types/app";
import type { VendorRow } from "@/lib/data/vendors";
import { VENDOR_STATUS_VALUES } from "@/lib/validations/vendor";
import { VendorFormSheet } from "./vendor-form-sheet";

export function VendorsView({
  vendors,
  canManage,
}: {
  vendors: VendorRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(vendor: Vendor) {
    setEditing(vendor);
    setSheetOpen(true);
  }

  async function handleDelete(vendor: VendorRow) {
    const result = await deleteVendor(vendor.id);
    if (result.ok) {
      toast.success("Vendor deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const columns: DataTableColumn<VendorRow>[] = [
    {
      id: "name",
      header: "Vendor",
      sortAccessor: (v) => v.name.toLowerCase(),
      cell: (v) => (
        <Link
          href={`/vendors/${v.id}`}
          className="font-medium hover:underline"
        >
          {v.name}
        </Link>
      ),
    },
    {
      id: "trade",
      header: "Trade",
      sortAccessor: (v) => v.trade ?? "",
      cell: (v) => v.trade || "—",
    },
    {
      id: "status",
      header: "Status",
      cell: (v) => {
        const meta = VENDOR_STATUS_META[v.status];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
    },
    {
      id: "rating",
      header: "Rating",
      align: "right",
      sortAccessor: (v) => v.rating_avg ?? -1,
      cell: (v) =>
        v.rating_avg != null ? (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            {v.rating_avg.toFixed(1)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "open_jobs",
      header: "Open jobs",
      align: "right",
      sortAccessor: (v) => v.open_work_orders,
      cell: (v) => (
        <span className="tabular-nums">{v.open_work_orders}</span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        rows={vendors}
        columns={columns}
        getRowId={(v) => v.id}
        searchText={(v) => `${v.name} ${v.trade ?? ""} ${v.city ?? ""}`}
        searchPlaceholder="Search vendors…"
        facet={{
          label: "Status",
          options: VENDOR_STATUS_VALUES.map((s) => ({
            value: s,
            label: VENDOR_STATUS_META[s].label,
          })),
          matches: (v, value) => v.status === value,
        }}
        onEdit={canManage ? openEdit : undefined}
        onDelete={canManage ? handleDelete : undefined}
        deleteLabel={(v) => v.name}
        toolbar={
          canManage ? (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              New vendor
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            icon={Wrench}
            title="No vendors yet"
            description="Add your first vendor to start building your directory."
            action={
              canManage ? (
                <Button onClick={openNew}>
                  <Plus className="size-4" />
                  New vendor
                </Button>
              ) : undefined
            }
          />
        }
      />
      {canManage ? (
        <VendorFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          vendor={editing}
        />
      ) : null}
    </>
  );
}

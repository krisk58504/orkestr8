"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleStop, FileText, Plus } from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { LEASE_STATUS_META } from "@/lib/constants";
import type { LeaseRow } from "@/lib/data/leases";
import { LEASE_STATUS_VALUES } from "@/lib/validations/lease";
import { EndLeaseDialog } from "./end-lease-dialog";
import { LeaseFormSheet } from "./lease-form-sheet";

export function formatTenants(
  tenants: { first_name: string; last_name: string }[],
): string {
  if (tenants.length === 0) return "—";
  const first = `${tenants[0].first_name} ${tenants[0].last_name}`;
  if (tenants.length === 1) return first;
  if (tenants.length === 2) {
    return `${first}, ${tenants[1].first_name} ${tenants[1].last_name}`;
  }
  return `${first} + ${tenants.length - 1} others`;
}

export function LeasesView({
  leases,
  propertyOptions,
  unitOptions,
  tenantOptions,
  canManage,
}: {
  leases: LeaseRow[];
  propertyOptions: { id: string; name: string }[];
  unitOptions: { id: string; unit_number: string; property_id: string }[];
  tenantOptions: {
    id: string;
    first_name: string;
    last_name: string;
    lease_id: string | null;
  }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<LeaseRow | null>(null);
  const [endingLease, setEndingLease] = useState<LeaseRow | null>(null);

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(lease: LeaseRow) {
    setEditing(lease);
    setSheetOpen(true);
  }

  const columns: DataTableColumn<LeaseRow>[] = [
    {
      id: "unit",
      header: "Unit",
      sortAccessor: (l) => l.unit_number ?? "",
      cell: (l) => l.unit_number ?? "—",
    },
    {
      id: "property",
      header: "Property",
      sortAccessor: (l) => l.property_name ?? "",
      cell: (l) => l.property_name ?? "—",
    },
    {
      id: "tenants",
      header: "Tenants",
      cell: (l) => formatTenants(l.tenants),
    },
    {
      id: "rent",
      header: "Monthly Rent",
      sortAccessor: (l) => l.monthly_rent,
      cell: (l) =>
        `$${l.monthly_rent.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
    },
    {
      id: "start",
      header: "Start",
      sortAccessor: (l) => l.start_date,
      cell: (l) => l.start_date,
    },
    {
      id: "end",
      header: "End",
      sortAccessor: (l) => l.end_date ?? "",
      cell: (l) => l.end_date ?? "—",
    },
    {
      id: "status",
      header: "Status",
      sortAccessor: (l) => l.status,
      cell: (l) => {
        const meta = LEASE_STATUS_META[l.status];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
    },
  ];

  return (
    <>
      <DataTable
        rows={leases}
        columns={columns}
        getRowId={(l) => l.id}
        searchText={(l) =>
          `${l.unit_number ?? ""} ${l.property_name ?? ""} ${l.tenants
            .map((t) => `${t.first_name} ${t.last_name}`)
            .join(" ")}`
        }
        searchPlaceholder="Search leases…"
        facet={{
          label: "Status",
          options: LEASE_STATUS_VALUES.map((s) => ({
            value: s,
            label: LEASE_STATUS_META[s].label,
          })),
          matches: (l, v) => l.status === v,
        }}
        onEdit={canManage ? openEdit : undefined}
        rowActions={
          canManage
            ? (lease) =>
                lease.status === "ended" ? null : (
                  <DropdownMenuItem onClick={() => setEndingLease(lease)}>
                    <CircleStop className="size-4" />
                    End lease
                  </DropdownMenuItem>
                )
            : undefined
        }
        toolbar={
          canManage ? (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              New lease
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            icon={FileText}
            title="No leases yet"
            description="Leases will appear here once they're created."
            action={
              canManage ? (
                <Button onClick={openNew}>
                  <Plus className="size-4" />
                  New lease
                </Button>
              ) : undefined
            }
          />
        }
      />
      {canManage ? (
        <>
          <LeaseFormSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            lease={editing}
            propertyOptions={propertyOptions}
            unitOptions={unitOptions}
            tenantOptions={tenantOptions}
          />
          <EndLeaseDialog
            open={endingLease !== null}
            onOpenChange={(open) => {
              if (!open) setEndingLease(null);
            }}
            lease={endingLease}
            onSuccess={() => router.refresh()}
          />
        </>
      ) : null}
    </>
  );
}

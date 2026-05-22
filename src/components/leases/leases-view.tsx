"use client";

import { FileText } from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { LEASE_STATUS_META } from "@/lib/constants";
import type { LeaseRow } from "@/lib/data/leases";
import { LEASE_STATUS_VALUES } from "@/lib/validations/lease";

function formatTenants(
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

export function LeasesView({ leases }: { leases: LeaseRow[] }) {
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
      emptyState={
        <EmptyState
          icon={FileText}
          title="No leases yet"
          description="Leases will appear here once they're created."
        />
      }
    />
  );
}

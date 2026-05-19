"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { deleteProperty } from "@/app/(app)/properties/actions";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { PROPERTY_TYPE_LABELS } from "@/lib/constants";
import type { Property, PropertyWithStats } from "@/lib/types/app";
import { PROPERTY_TYPE_VALUES } from "@/lib/validations/property";
import { PropertyFormSheet } from "./property-form-sheet";

export function PropertiesView({
  properties,
  canManage,
}: {
  properties: PropertyWithStats[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(property: Property) {
    setEditing(property);
    setSheetOpen(true);
  }

  async function handleDelete(property: PropertyWithStats) {
    const result = await deleteProperty(property.id);
    if (result.ok) {
      toast.success("Property deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const columns: DataTableColumn<PropertyWithStats>[] = [
    {
      id: "name",
      header: "Property",
      sortAccessor: (p) => p.name.toLowerCase(),
      cell: (p) => (
        <Link
          href={`/properties/${p.id}`}
          className="font-medium hover:underline"
        >
          {p.name}
        </Link>
      ),
    },
    {
      id: "type",
      header: "Type",
      sortAccessor: (p) => p.property_type,
      cell: (p) => PROPERTY_TYPE_LABELS[p.property_type],
    },
    {
      id: "location",
      header: "Location",
      cell: (p) => [p.city, p.state].filter(Boolean).join(", ") || "—",
    },
    {
      id: "units",
      header: "Units",
      align: "right",
      sortAccessor: (p) => p.unit_count,
      cell: (p) => <span className="tabular-nums">{p.unit_count}</span>,
    },
    {
      id: "occupancy",
      header: "Occupancy",
      align: "right",
      sortAccessor: (p) => (p.unit_count ? p.occupied_count / p.unit_count : -1),
      cell: (p) =>
        p.unit_count > 0 ? (
          <span className="tabular-nums">
            {Math.round((p.occupied_count / p.unit_count) * 100)}%
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: (p) => (
        <StatusBadge tone={p.is_active ? "success" : "neutral"}>
          {p.is_active ? "Active" : "Inactive"}
        </StatusBadge>
      ),
    },
  ];

  return (
    <>
      <DataTable
        rows={properties}
        columns={columns}
        getRowId={(p) => p.id}
        searchText={(p) => `${p.name} ${p.city ?? ""} ${p.state ?? ""}`}
        searchPlaceholder="Search properties…"
        facet={{
          label: "Type",
          options: PROPERTY_TYPE_VALUES.map((t) => ({
            value: t,
            label: PROPERTY_TYPE_LABELS[t],
          })),
          matches: (p, v) => p.property_type === v,
        }}
        onEdit={canManage ? openEdit : undefined}
        onDelete={canManage ? handleDelete : undefined}
        deleteLabel={(p) => p.name}
        toolbar={
          canManage ? (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              New property
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            icon={Building2}
            title="No properties yet"
            description="Add your first property to start building your portfolio."
            action={
              canManage ? (
                <Button onClick={openNew}>
                  <Plus className="size-4" />
                  New property
                </Button>
              ) : undefined
            }
          />
        }
      />
      {canManage ? (
        <PropertyFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          property={editing}
        />
      ) : null}
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, Plus } from "lucide-react";
import { toast } from "sonner";
import { deleteUnit } from "@/app/(app)/units/actions";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { UNIT_STATUS_META } from "@/lib/constants";
import type { Unit } from "@/lib/types/app";
import type { UnitRow } from "@/lib/data/units";
import { UNIT_STATUS_VALUES } from "@/lib/validations/unit";
import { UnitFormSheet } from "./unit-form-sheet";

export function UnitsView({
  units,
  propertyOptions,
  buildingOptions,
  canManage,
}: {
  units: UnitRow[];
  propertyOptions: { id: string; name: string }[];
  buildingOptions: { id: string; name: string; property_id: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(unit: Unit) {
    setEditing(unit);
    setSheetOpen(true);
  }

  async function handleDelete(unit: UnitRow) {
    const result = await deleteUnit(unit.id);
    if (result.ok) {
      toast.success("Unit deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const columns: DataTableColumn<UnitRow>[] = [
    {
      id: "unit_number",
      header: "Unit",
      sortAccessor: (u) => u.unit_number.toLowerCase(),
      cell: (u) => <span className="font-medium">{u.unit_number}</span>,
    },
    {
      id: "property",
      header: "Property",
      sortAccessor: (u) => u.property_name?.toLowerCase(),
      cell: (u) => u.property_name ?? "—",
    },
    {
      id: "building",
      header: "Building",
      sortAccessor: (u) => u.building_name?.toLowerCase(),
      cell: (u) => u.building_name ?? "—",
    },
    {
      id: "status",
      header: "Status",
      cell: (u) => (
        <StatusBadge tone={UNIT_STATUS_META[u.status].tone}>
          {UNIT_STATUS_META[u.status].label}
        </StatusBadge>
      ),
    },
    {
      id: "beds",
      header: "Beds",
      align: "right",
      sortAccessor: (u) => u.bedrooms,
      cell: (u) => <span className="tabular-nums">{u.bedrooms}</span>,
    },
    {
      id: "baths",
      header: "Baths",
      align: "right",
      sortAccessor: (u) => u.bathrooms,
      cell: (u) => <span className="tabular-nums">{u.bathrooms}</span>,
    },
    {
      id: "rent",
      header: "Rent",
      align: "right",
      sortAccessor: (u) => u.market_rent,
      cell: (u) =>
        u.market_rent != null ? (
          <span className="tabular-nums">
            ${u.market_rent.toLocaleString("en-US")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <>
      <DataTable
        rows={units}
        columns={columns}
        getRowId={(u) => u.id}
        searchText={(u) =>
          `${u.unit_number} ${u.property_name ?? ""} ${u.building_name ?? ""}`
        }
        searchPlaceholder="Search units…"
        facet={{
          label: "Status",
          options: UNIT_STATUS_VALUES.map((s) => ({
            value: s,
            label: UNIT_STATUS_META[s].label,
          })),
          matches: (u, v) => u.status === v,
        }}
        onEdit={canManage ? openEdit : undefined}
        onDelete={canManage ? handleDelete : undefined}
        deleteLabel={(u) => u.unit_number}
        toolbar={
          canManage ? (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              New unit
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            icon={DoorOpen}
            title="No units yet"
            description="Add your first unit to start tracking occupancy."
            action={
              canManage ? (
                <Button onClick={openNew}>
                  <Plus className="size-4" />
                  New unit
                </Button>
              ) : undefined
            }
          />
        }
      />
      {canManage ? (
        <UnitFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          unit={editing}
          propertyOptions={propertyOptions}
          buildingOptions={buildingOptions}
        />
      ) : null}
    </>
  );
}

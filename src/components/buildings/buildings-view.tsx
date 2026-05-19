"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { deleteBuilding } from "@/app/(app)/buildings/actions";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { BUILDING_STATUS_META } from "@/lib/constants";
import type { Building } from "@/lib/types/app";
import type { BuildingRow } from "@/lib/data/buildings";
import { BUILDING_STATUS_VALUES } from "@/lib/validations/building";
import { BuildingFormSheet } from "./building-form-sheet";

export function BuildingsView({
  buildings,
  properties,
  canManage,
}: {
  buildings: BuildingRow[];
  properties: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Building | null>(null);

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(building: Building) {
    setEditing(building);
    setSheetOpen(true);
  }

  async function handleDelete(building: BuildingRow) {
    const result = await deleteBuilding(building.id);
    if (result.ok) {
      toast.success("Building deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const columns: DataTableColumn<BuildingRow>[] = [
    {
      id: "name",
      header: "Building",
      sortAccessor: (b) => b.name.toLowerCase(),
      cell: (b) => <span className="font-medium">{b.name}</span>,
    },
    {
      id: "property",
      header: "Property",
      sortAccessor: (b) => b.property_name ?? "",
      cell: (b) => b.property_name ?? "—",
    },
    {
      id: "status",
      header: "Status",
      cell: (b) => (
        <StatusBadge tone={BUILDING_STATUS_META[b.status].tone}>
          {BUILDING_STATUS_META[b.status].label}
        </StatusBadge>
      ),
    },
    {
      id: "floors",
      header: "Floors",
      align: "right",
      sortAccessor: (b) => b.floors,
      cell: (b) =>
        b.floors != null ? (
          <span className="tabular-nums">{b.floors}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <>
      <DataTable
        rows={buildings}
        columns={columns}
        getRowId={(b) => b.id}
        searchText={(b) => `${b.name} ${b.property_name ?? ""}`}
        searchPlaceholder="Search buildings…"
        facet={{
          label: "Status",
          options: BUILDING_STATUS_VALUES.map((s) => ({
            value: s,
            label: BUILDING_STATUS_META[s].label,
          })),
          matches: (b, v) => b.status === v,
        }}
        onEdit={canManage ? openEdit : undefined}
        onDelete={canManage ? handleDelete : undefined}
        deleteLabel={(b) => b.name}
        toolbar={
          canManage ? (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              New building
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            icon={Building2}
            title="No buildings yet"
            description="Add your first building to organize units within a property."
            action={
              canManage ? (
                <Button onClick={openNew}>
                  <Plus className="size-4" />
                  New building
                </Button>
              ) : undefined
            }
          />
        }
      />
      {canManage ? (
        <BuildingFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          building={editing}
          properties={properties}
        />
      ) : null}
    </>
  );
}

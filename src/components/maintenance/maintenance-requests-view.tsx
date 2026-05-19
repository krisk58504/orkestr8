"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Wrench } from "lucide-react";
import { toast } from "sonner";
import { deleteMaintenanceRequest } from "@/app/(app)/maintenance/actions";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITY_META,
  MAINTENANCE_STATUS_META,
} from "@/lib/constants";
import type { MaintenanceRequest } from "@/lib/types/app";
import type { MaintenanceRequestRow } from "@/lib/data/maintenance-requests";
import { MAINTENANCE_STATUS_VALUES } from "@/lib/validations/maintenance-request";
import { MaintenanceRequestFormSheet } from "./maintenance-request-form-sheet";

export function MaintenanceRequestsView({
  requests,
  propertyOptions,
  unitOptions,
  tenantOptions,
  canManage,
}: {
  requests: MaintenanceRequestRow[];
  propertyOptions: { id: string; name: string }[];
  unitOptions: { id: string; unit_number: string; property_id: string }[];
  tenantOptions: {
    id: string;
    first_name: string;
    last_name: string;
    property_id: string | null;
  }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceRequest | null>(null);

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(request: MaintenanceRequest) {
    setEditing(request);
    setSheetOpen(true);
  }

  async function handleDelete(request: MaintenanceRequestRow) {
    const result = await deleteMaintenanceRequest(request.id);
    if (result.ok) {
      toast.success("Request deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const columns: DataTableColumn<MaintenanceRequestRow>[] = [
    {
      id: "title",
      header: "Title",
      sortAccessor: (r) => r.title.toLowerCase(),
      cell: (r) => (
        <Link
          href={`/maintenance/${r.id}`}
          className="font-medium hover:underline"
        >
          {r.title}
        </Link>
      ),
    },
    {
      id: "property",
      header: "Property",
      sortAccessor: (r) => r.property_name ?? "",
      cell: (r) => r.property_name ?? "—",
    },
    {
      id: "unit",
      header: "Unit",
      sortAccessor: (r) => r.unit_number ?? "",
      cell: (r) => r.unit_number ?? "—",
    },
    {
      id: "category",
      header: "Category",
      sortAccessor: (r) => r.category,
      cell: (r) => MAINTENANCE_CATEGORY_LABELS[r.category],
    },
    {
      id: "priority",
      header: "Priority",
      sortAccessor: (r) => r.priority,
      cell: (r) => (
        <StatusBadge tone={MAINTENANCE_PRIORITY_META[r.priority].tone}>
          {MAINTENANCE_PRIORITY_META[r.priority].label}
        </StatusBadge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <StatusBadge tone={MAINTENANCE_STATUS_META[r.status].tone}>
          {MAINTENANCE_STATUS_META[r.status].label}
        </StatusBadge>
      ),
    },
    {
      id: "created",
      header: "Created",
      sortAccessor: (r) => r.created_at,
      cell: (r) => new Date(r.created_at).toLocaleDateString(),
    },
  ];

  return (
    <>
      <DataTable
        rows={requests}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) =>
          `${r.title} ${r.property_name ?? ""} ${r.unit_number ?? ""}`
        }
        searchPlaceholder="Search requests…"
        facet={{
          label: "Status",
          options: MAINTENANCE_STATUS_VALUES.map((s) => ({
            value: s,
            label: MAINTENANCE_STATUS_META[s].label,
          })),
          matches: (r, v) => r.status === v,
        }}
        onEdit={canManage ? openEdit : undefined}
        onDelete={canManage ? handleDelete : undefined}
        deleteLabel={(r) => r.title}
        toolbar={
          canManage ? (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              New request
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            icon={Wrench}
            title="No maintenance requests yet"
            description="Log your first maintenance request to start tracking work."
            action={
              canManage ? (
                <Button onClick={openNew}>
                  <Plus className="size-4" />
                  New request
                </Button>
              ) : undefined
            }
          />
        }
      />
      {canManage ? (
        <MaintenanceRequestFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          request={editing}
          propertyOptions={propertyOptions}
          unitOptions={unitOptions}
          tenantOptions={tenantOptions}
        />
      ) : null}
    </>
  );
}

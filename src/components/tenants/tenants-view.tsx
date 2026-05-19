"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { deleteTenant } from "@/app/(app)/tenants/actions";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { TENANT_STATUS_META } from "@/lib/constants";
import type { Tenant } from "@/lib/types/app";
import type { TenantRow } from "@/lib/data/tenants";
import { TENANT_STATUS_VALUES } from "@/lib/validations/tenant";
import { TenantFormSheet } from "./tenant-form-sheet";

export function TenantsView({
  tenants,
  propertyOptions,
  unitOptions,
  canManage,
}: {
  tenants: TenantRow[];
  propertyOptions: { id: string; name: string }[];
  unitOptions: { id: string; unit_number: string; property_id: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(tenant: Tenant) {
    setEditing(tenant);
    setSheetOpen(true);
  }

  async function handleDelete(tenant: TenantRow) {
    const result = await deleteTenant(tenant.id);
    if (result.ok) {
      toast.success("Tenant deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const columns: DataTableColumn<TenantRow>[] = [
    {
      id: "name",
      header: "Name",
      sortAccessor: (t) => t.last_name.toLowerCase(),
      cell: (t) => (
        <span className="font-medium">
          {t.first_name} {t.last_name}
        </span>
      ),
    },
    {
      id: "email",
      header: "Email",
      sortAccessor: (t) => t.email ?? "",
      cell: (t) => t.email ?? "—",
    },
    {
      id: "property",
      header: "Property",
      sortAccessor: (t) => t.property_name ?? "",
      cell: (t) => t.property_name ?? "—",
    },
    {
      id: "unit",
      header: "Unit",
      sortAccessor: (t) => t.unit_number ?? "",
      cell: (t) => t.unit_number ?? "—",
    },
    {
      id: "status",
      header: "Status",
      cell: (t) => (
        <StatusBadge tone={TENANT_STATUS_META[t.status].tone}>
          {TENANT_STATUS_META[t.status].label}
        </StatusBadge>
      ),
    },
    {
      id: "move_in",
      header: "Move-in",
      sortAccessor: (t) => t.move_in_date ?? "",
      cell: (t) => t.move_in_date ?? "—",
    },
  ];

  return (
    <>
      <DataTable
        rows={tenants}
        columns={columns}
        getRowId={(t) => t.id}
        searchText={(t) =>
          `${t.first_name} ${t.last_name} ${t.email ?? ""} ${
            t.property_name ?? ""
          } ${t.unit_number ?? ""}`
        }
        searchPlaceholder="Search tenants…"
        facet={{
          label: "Status",
          options: TENANT_STATUS_VALUES.map((s) => ({
            value: s,
            label: TENANT_STATUS_META[s].label,
          })),
          matches: (t, v) => t.status === v,
        }}
        onEdit={canManage ? openEdit : undefined}
        onDelete={canManage ? handleDelete : undefined}
        deleteLabel={(t) => `${t.first_name} ${t.last_name}`}
        toolbar={
          canManage ? (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              New tenant
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            icon={Users}
            title="No tenants yet"
            description="Add your first tenant to start tracking residents."
            action={
              canManage ? (
                <Button onClick={openNew}>
                  <Plus className="size-4" />
                  New tenant
                </Button>
              ) : undefined
            }
          />
        }
      />
      {canManage ? (
        <TenantFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          tenant={editing}
          propertyOptions={propertyOptions}
          unitOptions={unitOptions}
        />
      ) : null}
    </>
  );
}

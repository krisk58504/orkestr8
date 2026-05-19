"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus } from "lucide-react";
import { toast } from "sonner";
import { deleteWorkOrder } from "@/app/(app)/work-orders/actions";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  MAINTENANCE_PRIORITY_META,
  WORK_ORDER_STATUS_META,
} from "@/lib/constants";
import type { WorkOrder } from "@/lib/types/app";
import type { WorkOrderRow } from "@/lib/data/work-orders";
import { WORK_ORDER_STATUS_VALUES } from "@/lib/validations/work-order";
import {
  WorkOrderFormSheet,
  type WorkOrderFormOptions,
} from "./work-order-form-sheet";

export function WorkOrdersView({
  workOrders,
  options,
  canManage,
}: {
  workOrders: WorkOrderRow[];
  options: WorkOrderFormOptions;
  canManage: boolean;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<WorkOrder | null>(null);

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(workOrder: WorkOrder) {
    setEditing(workOrder);
    setSheetOpen(true);
  }

  async function handleDelete(workOrder: WorkOrderRow) {
    const result = await deleteWorkOrder(workOrder.id);
    if (result.ok) {
      toast.success("Work order deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const columns: DataTableColumn<WorkOrderRow>[] = [
    {
      id: "number",
      header: "Number",
      sortAccessor: (w) => w.number ?? "",
      cell: (w) => (
        <span className="tabular-nums text-muted-foreground">
          {w.number ?? "—"}
        </span>
      ),
    },
    {
      id: "title",
      header: "Title",
      sortAccessor: (w) => w.title.toLowerCase(),
      cell: (w) => (
        <Link
          href={`/work-orders/${w.id}`}
          className="font-medium hover:underline"
        >
          {w.title}
        </Link>
      ),
    },
    {
      id: "property",
      header: "Property",
      sortAccessor: (w) => w.property_name ?? "",
      cell: (w) => w.property_name ?? "—",
    },
    {
      id: "status",
      header: "Status",
      sortAccessor: (w) => w.status,
      cell: (w) => {
        const meta = WORK_ORDER_STATUS_META[w.status];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
    },
    {
      id: "priority",
      header: "Priority",
      sortAccessor: (w) => w.priority,
      cell: (w) => {
        const meta = MAINTENANCE_PRIORITY_META[w.priority];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
    },
    {
      id: "assignee",
      header: "Assignee",
      cell: (w) => w.vendor_name ?? w.assignee_name ?? "Unassigned",
    },
  ];

  return (
    <>
      <DataTable
        rows={workOrders}
        columns={columns}
        getRowId={(w) => w.id}
        searchText={(w) =>
          `${w.number ?? ""} ${w.title} ${w.property_name ?? ""} ${
            w.vendor_name ?? ""
          } ${w.assignee_name ?? ""}`
        }
        searchPlaceholder="Search work orders…"
        facet={{
          label: "Status",
          options: WORK_ORDER_STATUS_VALUES.map((s) => ({
            value: s,
            label: WORK_ORDER_STATUS_META[s].label,
          })),
          matches: (w, v) => w.status === v,
        }}
        onEdit={canManage ? openEdit : undefined}
        onDelete={canManage ? handleDelete : undefined}
        deleteLabel={(w) => w.title}
        toolbar={
          canManage ? (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              New work order
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            icon={ClipboardList}
            title="No work orders yet"
            description="Create your first work order to track maintenance work."
            action={
              canManage ? (
                <Button onClick={openNew}>
                  <Plus className="size-4" />
                  New work order
                </Button>
              ) : undefined
            }
          />
        }
      />
      {canManage ? (
        <WorkOrderFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          workOrder={editing}
          options={options}
        />
      ) : null}
    </>
  );
}

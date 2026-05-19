import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSessionContext } from "@/lib/auth/session";
import {
  MAINTENANCE_PRIORITY_META,
  WORK_ORDER_STATUS_META,
} from "@/lib/constants";
import { listVendorWorkOrders } from "@/lib/data/vendor-portal";

export const metadata: Metadata = { title: "Work Orders" };

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

export default async function VendorWorkOrdersPage() {
  const context = await getSessionContext();
  if (!context?.vendorId) return null;

  const workOrders = await listVendorWorkOrders(context.vendorId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Orders"
        description="Maintenance work assigned to your company."
      />

      {workOrders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No work orders assigned"
          description="When the property-management team assigns work to your company, it will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scheduled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workOrders.map((workOrder) => {
                const statusMeta = WORK_ORDER_STATUS_META[workOrder.status];
                const priorityMeta =
                  MAINTENANCE_PRIORITY_META[workOrder.priority];
                return (
                  <TableRow key={workOrder.id}>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {workOrder.number ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/vendor-portal/work-orders/${workOrder.id}`}
                        className="font-medium hover:underline"
                      >
                        {workOrder.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {workOrder.property_name ?? "—"}
                      {workOrder.unit_number
                        ? ` · Unit ${workOrder.unit_number}`
                        : ""}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={priorityMeta.tone}>
                        {priorityMeta.label}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={statusMeta.tone}>
                        {statusMeta.label}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(workOrder.scheduled_for)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

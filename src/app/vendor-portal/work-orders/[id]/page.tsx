import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WorkOrderVendorActions } from "@/components/vendor-portal/work-order-vendor-actions";
import { WorkOrderPhotos } from "@/components/work-orders/work-order-photos";
import { getSessionContext } from "@/lib/auth/session";
import {
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITY_META,
  WORK_ORDER_STATUS_META,
} from "@/lib/constants";
import { getVendorWorkOrder } from "@/lib/data/vendor-portal";
import { listWorkOrderPhotos } from "@/lib/data/work-order-photos";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Work Order" };

function formatDateTime(value: string | null): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString();
}

function formatCost(value: number | null): string {
  return value != null ? `$${value.toLocaleString()}` : "Not set";
}

export default async function VendorWorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getSessionContext();
  if (!context?.vendorId) return null;

  const workOrder = await getVendorWorkOrder(context.vendorId, id);
  if (!workOrder) notFound();

  const supabase = await createClient();

  // RLS scopes properties/units to the vendor only via the work order it can
  // see; query by id and rely on RLS for access. The work order's own
  // organization_id is the managing org (not the vendor user's own org).
  const [propertyResult, unitResult] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name")
      .eq("id", workOrder.property_id)
      .maybeSingle(),
    workOrder.unit_id
      ? supabase
          .from("units")
          .select("id, unit_number")
          .eq("id", workOrder.unit_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const property = propertyResult.data;
  const unit = unitResult.data;

  // Photos: scope by the work order's managing organization_id (NOT the
  // vendor user's own org). The assigned vendor may add/remove photos — RLS
  // and the photo-actions enforce this.
  const photos = await listWorkOrderPhotos(workOrder.organization_id, id);

  const statusMeta = WORK_ORDER_STATUS_META[workOrder.status];
  const priorityMeta = MAINTENANCE_PRIORITY_META[workOrder.priority];

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2"
          render={<Link href="/vendor-portal/work-orders" />}
        >
          <ArrowLeft className="size-4" />
          Work Orders
        </Button>
        <PageHeader
          title={workOrder.title}
          description={`${workOrder.number ? `${workOrder.number} · ` : ""}${
            property?.name ?? "Unknown property"
          }${unit ? ` · Unit ${unit.unit_number}` : ""}`}
        >
          <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
        </PageHeader>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your actions</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkOrderVendorActions
            workOrderId={id}
            status={workOrder.status}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Status</p>
            <StatusBadge tone={statusMeta.tone}>
              {statusMeta.label}
            </StatusBadge>
          </div>
          <div>
            <p className="text-muted-foreground">Priority</p>
            <StatusBadge tone={priorityMeta.tone}>
              {priorityMeta.label}
            </StatusBadge>
          </div>
          <div>
            <p className="text-muted-foreground">Category</p>
            <p>{MAINTENANCE_CATEGORY_LABELS[workOrder.category]}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Scheduled for</p>
            <p>{formatDateTime(workOrder.scheduled_for)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">SLA due</p>
            <p>{formatDateTime(workOrder.sla_due_at)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Accepted at</p>
            <p>{formatDateTime(workOrder.accepted_at)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Completed at</p>
            <p>{formatDateTime(workOrder.completed_at)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Cost estimate</p>
            <p>{formatCost(workOrder.cost_estimate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Actual cost</p>
            <p>{formatCost(workOrder.cost_actual)}</p>
          </div>
          {workOrder.description ? (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Description</p>
              <p className="whitespace-pre-wrap">{workOrder.description}</p>
            </div>
          ) : null}
          {workOrder.notes ? (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap">{workOrder.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkOrderPhotos
            workOrderId={id}
            photos={photos}
            canManage={true}
          />
        </CardContent>
      </Card>
    </div>
  );
}

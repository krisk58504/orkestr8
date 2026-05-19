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
import { WorkOrderPhotos } from "@/components/work-orders/work-order-photos";
import { isStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import {
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITY_META,
  WORK_ORDER_ASSIGNEE_LABELS,
  WORK_ORDER_STATUS_META,
} from "@/lib/constants";
import { getWorkOrder } from "@/lib/data/work-orders";
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

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getSessionContext();
  if (!context) return null;

  const workOrder = await getWorkOrder(context.organization.id, id);
  if (!workOrder) notFound();

  const supabase = await createClient();

  const [propertyResult, unitResult, vendorResult, userResult, requestResult] =
    await Promise.all([
      supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", context.organization.id)
        .eq("id", workOrder.property_id)
        .maybeSingle(),
      workOrder.unit_id
        ? supabase
            .from("units")
            .select("id, unit_number")
            .eq("organization_id", context.organization.id)
            .eq("id", workOrder.unit_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      workOrder.assigned_vendor_id
        ? supabase
            .from("vendors")
            .select("id, name")
            .eq("organization_id", context.organization.id)
            .eq("id", workOrder.assigned_vendor_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      workOrder.assigned_user_id
        ? supabase
            .from("users")
            .select("id, full_name, email")
            .eq("organization_id", context.organization.id)
            .eq("id", workOrder.assigned_user_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      workOrder.maintenance_request_id
        ? supabase
            .from("maintenance_requests")
            .select("id, title")
            .eq("organization_id", context.organization.id)
            .eq("id", workOrder.maintenance_request_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const property = propertyResult.data;
  const unit = unitResult.data;
  const vendor = vendorResult.data;
  const assignedUser = userResult.data;
  const maintenanceRequest = requestResult.data;

  const photos = await listWorkOrderPhotos(context.organization.id, id);
  const canManagePhotos = isStaff(context.roles);

  const statusMeta = WORK_ORDER_STATUS_META[workOrder.status];
  const priorityMeta = MAINTENANCE_PRIORITY_META[workOrder.priority];

  const assigneeLabel =
    workOrder.assignee_type === "vendor"
      ? (vendor?.name ?? WORK_ORDER_ASSIGNEE_LABELS.vendor)
      : workOrder.assignee_type === "internal"
        ? (assignedUser?.full_name ??
          assignedUser?.email ??
          WORK_ORDER_ASSIGNEE_LABELS.internal)
        : WORK_ORDER_ASSIGNEE_LABELS.unassigned;

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2"
          render={<Link href="/work-orders" />}
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
            <p className="text-muted-foreground">Assignee</p>
            <p>
              {assigneeLabel}
              <span className="text-muted-foreground">
                {" "}
                ({WORK_ORDER_ASSIGNEE_LABELS[workOrder.assignee_type]})
              </span>
            </p>
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

      {maintenanceRequest ? (
        <Card>
          <CardHeader>
            <CardTitle>Linked maintenance request</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <Link
              href={`/maintenance/${maintenanceRequest.id}`}
              className="font-medium hover:underline"
            >
              {maintenanceRequest.title}
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkOrderPhotos
            workOrderId={id}
            photos={photos}
            canManage={canManagePhotos}
          />
        </CardContent>
      </Card>
    </div>
  );
}

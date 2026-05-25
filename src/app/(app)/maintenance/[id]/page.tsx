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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MaintenanceTriageCard } from "@/components/maintenance/maintenance-triage-card";
import { VendorSuggestionCard } from "@/components/maintenance/vendor-suggestion-card";
import type { MaintenanceTriageResult } from "@/lib/ai/maintenance-triage";
import type { VendorSuggestionResult } from "@/lib/ai/vendor-suggestion";
import { isStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import {
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITY_META,
  MAINTENANCE_STATUS_META,
  WORK_ORDER_STATUS_META,
} from "@/lib/constants";
import { getMaintenanceRequest } from "@/lib/data/maintenance-requests";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Maintenance request" };

export default async function MaintenanceRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getSessionContext();
  if (!context) return null;

  const request = await getMaintenanceRequest(context.organization.id, id);
  if (!request) notFound();

  const supabase = await createClient();
  const { data: workOrdersData } = await supabase
    .from("work_orders")
    .select("*")
    .eq("organization_id", context.organization.id)
    .eq("maintenance_request_id", id)
    .order("created_at", { ascending: false });
  const workOrders = workOrdersData ?? [];

  const statusMeta = MAINTENANCE_STATUS_META[request.status];
  const priorityMeta = MAINTENANCE_PRIORITY_META[request.priority];
  const triage =
    (request.ai_triage as unknown as MaintenanceTriageResult | null) ?? null;
  const vendorSuggestions =
    (request.ai_vendor_suggestions as unknown as VendorSuggestionResult | null) ??
    null;
  const canTriage = isStaff(context.roles);

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2"
          render={<Link href="/maintenance" />}
        >
          <ArrowLeft className="size-4" />
          Maintenance
        </Button>
        <PageHeader
          title={request.title}
          description={`${MAINTENANCE_CATEGORY_LABELS[request.category]}${
            request.property_name ? ` · ${request.property_name}` : ""
          }`}
        >
          <StatusBadge tone={priorityMeta.tone}>
            {priorityMeta.label}
          </StatusBadge>
          <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
        </PageHeader>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Property</p>
            <p>{request.property_name ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Unit</p>
            <p>{request.unit_number ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Category</p>
            <p>{MAINTENANCE_CATEGORY_LABELS[request.category]}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Priority</p>
            <p>{priorityMeta.label}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <p>{statusMeta.label}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Permission to enter</p>
            <p>{request.permission_to_enter ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Created</p>
            <p>{new Date(request.created_at).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Updated</p>
            <p>{new Date(request.updated_at).toLocaleString()}</p>
          </div>
          {request.location_notes ? (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Location notes</p>
              <p className="whitespace-pre-wrap">{request.location_notes}</p>
            </div>
          ) : null}
          {request.description ? (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Description</p>
              <p className="whitespace-pre-wrap">{request.description}</p>
            </div>
          ) : null}
          {request.access_instructions ? (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Access instructions</p>
              <p className="whitespace-pre-wrap">
                {request.access_instructions}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI triage</CardTitle>
          <CardDescription>
            Maintenance triage — gated by the AI safety chokepoint
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MaintenanceTriageCard
            requestId={request.id}
            initialTriage={triage}
            initialTriagedAt={request.ai_triaged_at}
            canRun={canTriage}
          />
        </CardContent>
      </Card>

      <VendorSuggestionCard
        requestId={request.id}
        initialSuggestions={vendorSuggestions}
        initialGeneratedAt={request.ai_vendor_suggestions_generated_at}
        canRun={canTriage}
      />

      <Card>
        <CardHeader>
          <CardTitle>Work orders</CardTitle>
          <CardDescription>
            Work orders linked to this maintenance request
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No work orders linked to this request.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workOrders.map((workOrder) => {
                  const meta = WORK_ORDER_STATUS_META[workOrder.status];
                  const priority =
                    MAINTENANCE_PRIORITY_META[workOrder.priority];
                  return (
                    <TableRow key={workOrder.id}>
                      <TableCell className="font-medium">
                        {workOrder.title}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={meta.tone}>
                          {meta.label}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={priority.tone}>
                          {priority.label}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {new Date(
                          workOrder.created_at,
                        ).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

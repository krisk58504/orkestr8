import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  MaintenancePriority,
  MaintenanceStatus,
  WorkOrderStatus,
} from "@/lib/types/app";

export type MaintenanceReport = {
  period: { from: string; to: string };
  requests_created_in_period: number;
  open_requests_today: number;
  work_orders_completed_in_period: number;
  avg_resolution_hours: number | null;
  requests_by_status: Record<MaintenanceStatus, number>;
  requests_by_priority: Record<MaintenancePriority, number>;
  work_orders_by_status: Record<WorkOrderStatus, number>;
  per_property: Array<{
    property_id: string;
    property_name: string;
    requests_in_period: number;
    work_orders_completed: number;
    work_orders_open: number;
  }>;
};

export type ReportOpts = { propertyIds?: string[] };

const TERMINAL_MAINT_STATUSES: MaintenanceStatus[] = ["completed", "cancelled"];

export async function getMaintenanceReport(
  orgId: string,
  from: string,
  to: string,
  opts: ReportOpts = {},
): Promise<MaintenanceReport> {
  const supabase = await createClient();
  const toEnd = `${to}T23:59:59.999Z`;
  const restrictProps =
    opts.propertyIds && opts.propertyIds.length > 0 ? opts.propertyIds : null;

  // Period requests
  let reqsQuery = supabase
    .from("maintenance_requests")
    .select("id, status, priority, property_id, created_at")
    .eq("organization_id", orgId)
    .gte("created_at", from)
    .lte("created_at", toEnd);
  if (restrictProps) reqsQuery = reqsQuery.in("property_id", restrictProps);

  // Open requests right now (not bounded by period)
  let openReqsQuery = supabase
    .from("maintenance_requests")
    .select("id, property_id, status", { count: "exact" })
    .eq("organization_id", orgId)
    .not("status", "in", `(${TERMINAL_MAINT_STATUSES.join(",")})`);
  if (restrictProps)
    openReqsQuery = openReqsQuery.in("property_id", restrictProps);

  // Work orders completed in period
  let woCompletedQuery = supabase
    .from("work_orders")
    .select("id, property_id, status, created_at, completed_at")
    .eq("organization_id", orgId)
    .not("completed_at", "is", null)
    .gte("completed_at", from)
    .lte("completed_at", toEnd);
  if (restrictProps)
    woCompletedQuery = woCompletedQuery.in("property_id", restrictProps);

  // All work orders currently open (status not completed/cancelled)
  let woOpenQuery = supabase
    .from("work_orders")
    .select("id, property_id, status")
    .eq("organization_id", orgId)
    .not("status", "in", "(completed,cancelled)");
  if (restrictProps) woOpenQuery = woOpenQuery.in("property_id", restrictProps);

  // Properties for per-property table
  let propsQuery = supabase
    .from("properties")
    .select("id, name")
    .eq("organization_id", orgId)
    .order("name");
  if (restrictProps) propsQuery = propsQuery.in("id", restrictProps);

  const [reqsRes, openReqsRes, woCompletedRes, woOpenRes, propsRes] =
    await Promise.all([
      reqsQuery,
      openReqsQuery,
      woCompletedQuery,
      woOpenQuery,
      propsQuery,
    ]);

  const requests = reqsRes.data ?? [];
  const woCompleted = woCompletedRes.data ?? [];
  const woOpen = woOpenRes.data ?? [];

  // Status / priority breakdowns
  const requests_by_status: Record<MaintenanceStatus, number> = {
    submitted: 0,
    triaged: 0,
    scheduled: 0,
    in_progress: 0,
    on_hold: 0,
    completed: 0,
    cancelled: 0,
  };
  const requests_by_priority: Record<MaintenancePriority, number> = {
    low: 0,
    medium: 0,
    high: 0,
    emergency: 0,
  };
  for (const r of requests) {
    requests_by_status[r.status] += 1;
    requests_by_priority[r.priority] += 1;
  }

  const work_orders_by_status: Record<WorkOrderStatus, number> = {
    open: 0,
    assigned: 0,
    accepted: 0,
    in_progress: 0,
    on_hold: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const wo of woOpen) {
    work_orders_by_status[wo.status] += 1;
  }
  // Add the in-period completed WOs to the count (else completed = 0).
  work_orders_by_status.completed += woCompleted.length;

  // Avg resolution hours from completed-in-period WOs.
  let totalHours = 0;
  let countWithCreated = 0;
  for (const wo of woCompleted) {
    if (!wo.completed_at || !wo.created_at) continue;
    const ms =
      new Date(wo.completed_at).getTime() - new Date(wo.created_at).getTime();
    if (ms <= 0) continue;
    totalHours += ms / 3_600_000;
    countWithCreated += 1;
  }
  const avg_resolution_hours =
    countWithCreated > 0 ? totalHours / countWithCreated : null;

  // Per-property breakdown
  const reqsByProperty = new Map<string, number>();
  for (const r of requests) {
    reqsByProperty.set(
      r.property_id,
      (reqsByProperty.get(r.property_id) ?? 0) + 1,
    );
  }
  const woCompletedByProperty = new Map<string, number>();
  for (const wo of woCompleted) {
    woCompletedByProperty.set(
      wo.property_id,
      (woCompletedByProperty.get(wo.property_id) ?? 0) + 1,
    );
  }
  const woOpenByProperty = new Map<string, number>();
  for (const wo of woOpen) {
    woOpenByProperty.set(
      wo.property_id,
      (woOpenByProperty.get(wo.property_id) ?? 0) + 1,
    );
  }

  const per_property = (propsRes.data ?? []).map((p) => ({
    property_id: p.id,
    property_name: p.name,
    requests_in_period: reqsByProperty.get(p.id) ?? 0,
    work_orders_completed: woCompletedByProperty.get(p.id) ?? 0,
    work_orders_open: woOpenByProperty.get(p.id) ?? 0,
  }));

  return {
    period: { from, to },
    requests_created_in_period: requests.length,
    open_requests_today: openReqsRes.count ?? 0,
    work_orders_completed_in_period: woCompleted.length,
    avg_resolution_hours,
    requests_by_status,
    requests_by_priority,
    work_orders_by_status,
    per_property,
  };
}

export async function getMaintenanceSummary(
  orgId: string,
  opts: ReportOpts = {},
): Promise<{ open_requests: number }> {
  const supabase = await createClient();
  const restrictProps =
    opts.propertyIds && opts.propertyIds.length > 0 ? opts.propertyIds : null;
  let query = supabase
    .from("maintenance_requests")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .not("status", "in", `(${TERMINAL_MAINT_STATUSES.join(",")})`);
  if (restrictProps) query = query.in("property_id", restrictProps);
  const { count } = await query;
  return { open_requests: count ?? 0 };
}

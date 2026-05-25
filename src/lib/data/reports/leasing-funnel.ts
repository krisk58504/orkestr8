import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  ApplicationStatus,
  LeadSource,
} from "@/lib/types/app";

export type LeasingFunnelReport = {
  period: { from: string; to: string };
  leads_in_period: number;
  tours_in_period: number;
  applications_in_period: number;
  approved_applications_in_period: number;
  conversions_in_period: number; // tenants with source_application_id created in period
  conversion_rates: {
    lead_to_tour: number; // 0..1
    tour_to_application: number;
    application_to_approved: number;
    approved_to_conversion: number;
    lead_to_conversion: number;
  };
  leads_by_source: Record<LeadSource, number>;
  applications_by_status: Record<ApplicationStatus, number>;
};

export type ReportOpts = { propertyIds?: string[] };

/**
 * Funnel metrics across leads → tours → applications → approved →
 * conversions for the given period. propertyIds filter applies to leads
 * (via desired_property_id) and applications (via the lease/unit chain
 * — too expensive to resolve at this granularity for slice 10f baseline;
 * for the owner-portal subset in slice 10g, the leasing funnel report
 * is currently expected to be omitted per audit, so propertyIds scoping
 * is a best-effort filter on the lead side only).
 */
export async function getLeasingFunnelReport(
  orgId: string,
  from: string,
  to: string,
  opts: ReportOpts = {},
): Promise<LeasingFunnelReport> {
  const supabase = await createClient();
  const toEnd = `${to}T23:59:59.999Z`;
  const restrictProps =
    opts.propertyIds && opts.propertyIds.length > 0 ? opts.propertyIds : null;

  // Leads created in period
  let leadsQuery = supabase
    .from("leads")
    .select("id, source, created_at, desired_property_id")
    .eq("organization_id", orgId)
    .gte("created_at", from)
    .lte("created_at", toEnd);
  if (restrictProps) {
    leadsQuery = leadsQuery.in("desired_property_id", restrictProps);
  }

  // Tours scheduled in period
  const toursQuery = supabase
    .from("tours")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .gte("scheduled_at", from)
    .lte("scheduled_at", toEnd);

  // Applications created in period (with status mix)
  const appsQuery = supabase
    .from("applications")
    .select("id, status, created_at")
    .eq("organization_id", orgId)
    .gte("created_at", from)
    .lte("created_at", toEnd);

  // Conversions in period = tenants with source_application_id created in period
  const conversionsQuery = supabase
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .not("source_application_id", "is", null)
    .gte("created_at", from)
    .lte("created_at", toEnd);

  const [leadsRes, toursRes, appsRes, conversionsRes] = await Promise.all([
    leadsQuery,
    toursQuery,
    appsQuery,
    conversionsQuery,
  ]);

  const leads = leadsRes.data ?? [];
  const apps = appsRes.data ?? [];

  const leads_by_source: Record<LeadSource, number> = {
    website: 0,
    referral: 0,
    walkin: 0,
    partner: 0,
    other: 0,
  };
  for (const l of leads) leads_by_source[l.source] += 1;

  const applications_by_status: Record<ApplicationStatus, number> = {
    draft: 0,
    submitted: 0,
    under_review: 0,
    approved: 0,
    rejected: 0,
    withdrawn: 0,
  };
  for (const a of apps) applications_by_status[a.status] += 1;

  const leads_in_period = leads.length;
  const tours_in_period = toursRes.count ?? 0;
  const applications_in_period = apps.length;
  const approved_applications_in_period = applications_by_status.approved;
  const conversions_in_period = conversionsRes.count ?? 0;

  const safeRatio = (n: number, d: number): number => (d > 0 ? n / d : 0);

  return {
    period: { from, to },
    leads_in_period,
    tours_in_period,
    applications_in_period,
    approved_applications_in_period,
    conversions_in_period,
    conversion_rates: {
      lead_to_tour: safeRatio(tours_in_period, leads_in_period),
      tour_to_application: safeRatio(applications_in_period, tours_in_period),
      application_to_approved: safeRatio(
        approved_applications_in_period,
        applications_in_period,
      ),
      approved_to_conversion: safeRatio(
        conversions_in_period,
        approved_applications_in_period,
      ),
      lead_to_conversion: safeRatio(conversions_in_period, leads_in_period),
    },
    leads_by_source,
    applications_by_status,
  };
}

export async function getLeasingFunnelSummary(
  orgId: string,
  from: string,
  to: string,
): Promise<{ leads_in_period: number }> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .gte("created_at", from)
    .lte("created_at", `${to}T23:59:59.999Z`);
  return { leads_in_period: count ?? 0 };
}

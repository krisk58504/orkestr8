import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building, DoorOpen, Home } from "lucide-react";
import { PropertySummaryCard } from "@/components/owner-portal/property-summary-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { getSessionContext } from "@/lib/auth/session";
import { OCCUPIED_UNIT_STATUSES, PROPERTY_TYPE_LABELS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { PropertySummaryResult } from "@/lib/ai/property-summary";

export const metadata: Metadata = { title: "Property" };

function formatAddress(p: {
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}): string {
  const parts = [
    p.address_line1,
    [p.city, p.state, p.postal_code].filter(Boolean).join(" "),
  ].filter((s): s is string => !!s && s.trim().length > 0);
  return parts.length > 0 ? parts.join(" · ") : "Address not set";
}

function occupancyPct(occupied: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((occupied / total) * 100)}%`;
}

export default async function OwnerPropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [context, { id }] = await Promise.all([getSessionContext(), params]);
  if (!context) return null;

  const orgId = context.organization.id;
  const supabase = await createClient();

  // RLS enforces access — owner-self via user_can_see_property + staff
  // via current_user_org_id + tenant-self via M3LU. notFound() on null.
  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!property) return notFound();

  // Pull per-property stats for the header (mirrors PortfolioView card).
  const [unitsRes, buildingsRes] = await Promise.all([
    supabase
      .from("units")
      .select("id, status")
      .eq("organization_id", orgId)
      .eq("property_id", id),
    supabase
      .from("buildings")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("property_id", id),
  ]);
  const units = unitsRes.data ?? [];
  const unitCount = units.length;
  const occupiedCount = units.filter((u) =>
    OCCUPIED_UNIT_STATUSES.includes(u.status),
  ).length;
  const buildingCount = buildingsRes.count ?? 0;

  const initialSummary =
    (property.ai_summary as unknown as PropertySummaryResult | null) ?? null;

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        render={<Link href="/owner-portal" />}
      >
        <ArrowLeft className="size-4" />
        Portfolio
      </Button>

      <PageHeader
        title={property.name}
        description={`${PROPERTY_TYPE_LABELS[property.property_type]} · ${formatAddress(property)}`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Units"
          value={String(unitCount)}
          icon={DoorOpen}
          hint={`${occupiedCount} occupied`}
        />
        <StatCard
          label="Occupancy"
          value={occupancyPct(occupiedCount, unitCount)}
          icon={Home}
        />
        <StatCard
          label="Buildings"
          value={String(buildingCount)}
          icon={Building}
        />
      </div>

      <PropertySummaryCard
        propertyId={property.id}
        initialSummary={initialSummary}
        initialGeneratedAt={property.ai_summary_generated_at}
      />
    </div>
  );
}

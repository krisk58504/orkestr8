import type { Metadata } from "next";
import Link from "next/link";
import { Building2, DoorOpen, Plus, Users } from "lucide-react";
import { UnitStatusChart } from "@/components/dashboard/unit-status-chart";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionContext } from "@/lib/auth/session";
import {
  PROPERTY_TYPE_LABELS,
  UNIT_STATUS_META,
  type Tone,
} from "@/lib/constants";
import {
  getDashboardStats,
  getRecentProperties,
  getUnitStatusBreakdown,
} from "@/lib/data/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

const TONE_HEX: Record<Tone, string> = {
  neutral: "#94a3b8",
  info: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
};

export default async function DashboardPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const orgId = context.organization.id;
  const [stats, breakdown, recent] = await Promise.all([
    getDashboardStats(orgId),
    getUnitStatusBreakdown(orgId),
    getRecentProperties(orgId),
  ]);

  const firstName = context.profile.full_name?.trim().split(/\s+/)[0];
  const chartData = breakdown.map((b) => ({
    name: UNIT_STATUS_META[b.status].label,
    value: b.count,
    fill: TONE_HEX[UNIT_STATUS_META[b.status].tone],
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Dashboard"}
        description={`Portfolio overview for ${context.organization.name}`}
      >
        <Button render={<Link href="/properties" />}>
          <Plus className="size-4" />
          Add property
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Properties"
          value={stats.propertyCount}
          icon={Building2}
          hint={`${stats.buildingCount} building${stats.buildingCount === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Units"
          value={stats.unitCount}
          icon={DoorOpen}
          hint={`${stats.vacantCount} vacant`}
        />
        <StatCard
          label="Occupancy"
          value={`${stats.occupancyRate}%`}
          icon={DoorOpen}
          hint={`${stats.occupiedCount} of ${stats.unitCount} occupied`}
        />
        <StatCard
          label="Active tenants"
          value={stats.tenantCount}
          icon={Users}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Unit status</CardTitle>
            <CardDescription>Distribution across the portfolio</CardDescription>
          </CardHeader>
          <CardContent>
            <UnitStatusChart data={chartData} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent properties</CardTitle>
            <CardDescription>
              Most recently added to the portfolio
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No properties yet"
                description="Add your first property to start building your portfolio."
                action={
                  <Button render={<Link href="/properties" />}>
                    <Plus className="size-4" />
                    Add property
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {recent.map((property) => (
                  <li key={property.id}>
                    <Link
                      href={`/properties/${property.id}`}
                      className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-foreground"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{property.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[property.city, property.state]
                            .filter(Boolean)
                            .join(", ") || "No location set"}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {PROPERTY_TYPE_LABELS[property.property_type]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

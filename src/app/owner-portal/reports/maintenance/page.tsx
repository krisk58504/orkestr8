import type { Metadata } from "next";
import { Briefcase } from "lucide-react";
import { MaintenanceReport } from "@/components/reports/maintenance-report";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getSessionContext } from "@/lib/auth/session";
import { listOwnerPropertyIds } from "@/lib/data/property-owners";
import { getMaintenanceReport } from "@/lib/data/reports/maintenance";

export const metadata: Metadata = { title: "Maintenance report" };

function defaultPeriod(): { from: string; to: string } {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86_400_000);
  return {
    from: thirtyDaysAgo.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

function isValidDate(s: string | undefined): boolean {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

export default async function OwnerMaintenanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const [context, sp] = await Promise.all([getSessionContext(), searchParams]);
  if (!context) return null;

  const propertyIds = await listOwnerPropertyIds(
    context.authUserId,
    context.organization.id,
  );

  if (propertyIds.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Maintenance" />
        <EmptyState
          icon={Briefcase}
          title="No properties linked yet"
          description="Ask your property manager to grant ownership access."
        />
      </div>
    );
  }

  const defaults = defaultPeriod();
  const from = isValidDate(sp.from) ? sp.from! : defaults.from;
  const to = isValidDate(sp.to) ? sp.to! : defaults.to;

  const report = await getMaintenanceReport(
    context.organization.id,
    from,
    to,
    { propertyIds },
  );
  return (
    <MaintenanceReport
      report={report}
      backHref="/owner-portal/reports"
      dateRangeBasePath="/owner-portal/reports/maintenance"
    />
  );
}

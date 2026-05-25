import type { Metadata } from "next";
import { Briefcase } from "lucide-react";
import { OccupancyReport } from "@/components/reports/occupancy-report";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getSessionContext } from "@/lib/auth/session";
import { listOwnerPropertyIds } from "@/lib/data/property-owners";
import { getOccupancyReport } from "@/lib/data/reports/occupancy";

export const metadata: Metadata = { title: "Occupancy report" };

export default async function OwnerOccupancyReportPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const propertyIds = await listOwnerPropertyIds(
    context.authUserId,
    context.organization.id,
  );

  if (propertyIds.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Occupancy" />
        <EmptyState
          icon={Briefcase}
          title="No properties linked yet"
          description="Ask your property manager to grant ownership access."
        />
      </div>
    );
  }

  const rows = await getOccupancyReport(context.organization.id, {
    propertyIds,
  });
  return <OccupancyReport rows={rows} backHref="/owner-portal/reports" />;
}

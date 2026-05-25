import type { Metadata } from "next";
import { Briefcase } from "lucide-react";
import { OwnerReportsLanding } from "@/components/owner-portal/owner-reports-landing";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getSessionContext } from "@/lib/auth/session";
import { listOwnerPropertyIds } from "@/lib/data/property-owners";
import { getMaintenanceSummary } from "@/lib/data/reports/maintenance";
import { getOccupancySummary } from "@/lib/data/reports/occupancy";
import { getRentRollSummary } from "@/lib/data/reports/rent-roll";

export const metadata: Metadata = { title: "Reports" };

export default async function OwnerReportsPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const orgId = context.organization.id;
  const propertyIds = await listOwnerPropertyIds(context.authUserId, orgId);

  if (propertyIds.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Reports"
          description="Operational reports for the properties you own."
        />
        <EmptyState
          icon={Briefcase}
          title="No properties linked yet"
          description="Ask your property manager to grant ownership access. Once linked, occupancy, rent roll, and maintenance reports for your properties will appear here."
        />
      </div>
    );
  }

  const [occupancy, rentRoll, maintenance] = await Promise.all([
    getOccupancySummary(orgId, { propertyIds }),
    getRentRollSummary(orgId, { propertyIds }),
    getMaintenanceSummary(orgId, { propertyIds }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Operational reports for the properties you own."
      />
      <OwnerReportsLanding
        occupancy={occupancy}
        rentRoll={rentRoll}
        maintenance={maintenance}
      />
    </div>
  );
}

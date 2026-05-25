import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReportsLanding } from "@/components/reports/reports-landing";
import { PageHeader } from "@/components/shared/page-header";
import { isStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { getLeasingFunnelSummary } from "@/lib/data/reports/leasing-funnel";
import { getMaintenanceSummary } from "@/lib/data/reports/maintenance";
import { getOccupancySummary } from "@/lib/data/reports/occupancy";
import { getRentRollSummary } from "@/lib/data/reports/rent-roll";
import { getVendorPerformanceSummary } from "@/lib/data/reports/vendor-performance";

export const metadata: Metadata = { title: "Reports" };

function defaultPeriod(): { from: string; to: string } {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86_400_000);
  return {
    from: thirtyDaysAgo.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

export default async function ReportsLandingPage() {
  const context = await getSessionContext();
  if (!context) return null;
  if (!isStaff(context.roles)) redirect("/dashboard");

  const orgId = context.organization.id;
  const { from, to } = defaultPeriod();

  const [occupancy, rentRoll, maintenance, vendor, funnel] = await Promise.all([
    getOccupancySummary(orgId),
    getRentRollSummary(orgId),
    getMaintenanceSummary(orgId),
    getVendorPerformanceSummary(orgId),
    getLeasingFunnelSummary(orgId, from, to),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Operational and financial reports for your portfolio."
      />
      <ReportsLanding
        occupancy={occupancy}
        rentRoll={rentRoll}
        maintenance={maintenance}
        vendor={vendor}
        funnel={funnel}
      />
    </div>
  );
}

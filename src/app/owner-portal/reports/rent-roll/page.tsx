import type { Metadata } from "next";
import { Briefcase } from "lucide-react";
import { RentRollReport } from "@/components/reports/rent-roll-report";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getSessionContext } from "@/lib/auth/session";
import { listOwnerPropertyIds } from "@/lib/data/property-owners";
import { getRentRollReport } from "@/lib/data/reports/rent-roll";
import { getLatestReportInsight } from "@/lib/data/report-insights";
import type { ReportInsightResult } from "@/lib/ai/report-insight";

export const metadata: Metadata = { title: "Rent roll" };

export default async function OwnerRentRollReportPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const orgId = context.organization.id;
  const propertyIds = await listOwnerPropertyIds(context.authUserId, orgId);

  if (propertyIds.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Rent roll" />
        <EmptyState
          icon={Briefcase}
          title="No properties linked yet"
          description="Ask your property manager to grant ownership access."
        />
      </div>
    );
  }

  const [rows, insight] = await Promise.all([
    getRentRollReport(orgId, { propertyIds }),
    getLatestReportInsight(orgId, "rent_roll"),
  ]);

  return (
    <RentRollReport
      rows={rows}
      backHref="/owner-portal/reports"
      aiInsight={{
        aiScope: { reportType: "rent_roll", propertyIds },
        initialInsight: insight
          ? (insight.insight as unknown as ReportInsightResult)
          : null,
        initialGeneratedAt: insight?.generated_at ?? null,
      }}
    />
  );
}

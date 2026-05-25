import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OccupancyReport } from "@/components/reports/occupancy-report";
import { isStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { getOccupancyReport } from "@/lib/data/reports/occupancy";
import { getLatestReportInsight } from "@/lib/data/report-insights";
import type { ReportInsightResult } from "@/lib/ai/report-insight";

export const metadata: Metadata = { title: "Occupancy report" };

export default async function OccupancyReportPage() {
  const context = await getSessionContext();
  if (!context) return null;
  if (!isStaff(context.roles)) redirect("/dashboard");

  const orgId = context.organization.id;
  const [rows, insight] = await Promise.all([
    getOccupancyReport(orgId),
    getLatestReportInsight(orgId, "occupancy"),
  ]);

  return (
    <OccupancyReport
      rows={rows}
      aiInsight={{
        aiScope: { reportType: "occupancy" },
        initialInsight: insight
          ? (insight.insight as unknown as ReportInsightResult)
          : null,
        initialGeneratedAt: insight?.generated_at ?? null,
      }}
    />
  );
}

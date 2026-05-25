import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RentRollReport } from "@/components/reports/rent-roll-report";
import { isStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { getRentRollReport } from "@/lib/data/reports/rent-roll";
import { getLatestReportInsight } from "@/lib/data/report-insights";
import type { ReportInsightResult } from "@/lib/ai/report-insight";

export const metadata: Metadata = { title: "Rent roll" };

export default async function RentRollReportPage() {
  const context = await getSessionContext();
  if (!context) return null;
  if (!isStaff(context.roles)) redirect("/dashboard");

  const orgId = context.organization.id;
  const [rows, insight] = await Promise.all([
    getRentRollReport(orgId),
    getLatestReportInsight(orgId, "rent_roll"),
  ]);

  return (
    <RentRollReport
      rows={rows}
      aiInsight={{
        aiScope: { reportType: "rent_roll" },
        initialInsight: insight
          ? (insight.insight as unknown as ReportInsightResult)
          : null,
        initialGeneratedAt: insight?.generated_at ?? null,
      }}
    />
  );
}

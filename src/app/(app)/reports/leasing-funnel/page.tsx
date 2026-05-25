import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LeasingFunnelReport } from "@/components/reports/leasing-funnel-report";
import { isStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { getLeasingFunnelReport } from "@/lib/data/reports/leasing-funnel";
import { getLatestReportInsight } from "@/lib/data/report-insights";
import type { ReportInsightResult } from "@/lib/ai/report-insight";

export const metadata: Metadata = { title: "Leasing funnel" };

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

export default async function LeasingFunnelReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const [context, sp] = await Promise.all([getSessionContext(), searchParams]);
  if (!context) return null;
  if (!isStaff(context.roles)) redirect("/dashboard");

  const orgId = context.organization.id;
  const defaults = defaultPeriod();
  const from = isValidDate(sp.from) ? sp.from! : defaults.from;
  const to = isValidDate(sp.to) ? sp.to! : defaults.to;

  const [report, insight] = await Promise.all([
    getLeasingFunnelReport(orgId, from, to),
    getLatestReportInsight(orgId, "leasing_funnel"),
  ]);

  return (
    <LeasingFunnelReport
      report={report}
      aiInsight={{
        aiScope: { reportType: "leasing_funnel" },
        initialInsight: insight
          ? (insight.insight as unknown as ReportInsightResult)
          : null,
        initialGeneratedAt: insight?.generated_at ?? null,
      }}
    />
  );
}

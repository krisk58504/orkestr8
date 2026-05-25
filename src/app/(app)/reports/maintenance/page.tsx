import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MaintenanceReport } from "@/components/reports/maintenance-report";
import { isStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
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

export default async function MaintenanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const [context, sp] = await Promise.all([getSessionContext(), searchParams]);
  if (!context) return null;
  if (!isStaff(context.roles)) redirect("/dashboard");

  const defaults = defaultPeriod();
  const from = isValidDate(sp.from) ? sp.from! : defaults.from;
  const to = isValidDate(sp.to) ? sp.to! : defaults.to;

  const report = await getMaintenanceReport(
    context.organization.id,
    from,
    to,
  );
  return <MaintenanceReport report={report} />;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OccupancyReport } from "@/components/reports/occupancy-report";
import { isStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { getOccupancyReport } from "@/lib/data/reports/occupancy";

export const metadata: Metadata = { title: "Occupancy report" };

export default async function OccupancyReportPage() {
  const context = await getSessionContext();
  if (!context) return null;
  if (!isStaff(context.roles)) redirect("/dashboard");

  const rows = await getOccupancyReport(context.organization.id);
  return <OccupancyReport rows={rows} />;
}

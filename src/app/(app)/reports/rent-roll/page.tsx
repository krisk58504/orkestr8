import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RentRollReport } from "@/components/reports/rent-roll-report";
import { isStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { getRentRollReport } from "@/lib/data/reports/rent-roll";

export const metadata: Metadata = { title: "Rent roll" };

export default async function RentRollReportPage() {
  const context = await getSessionContext();
  if (!context) return null;
  if (!isStaff(context.roles)) redirect("/dashboard");

  const rows = await getRentRollReport(context.organization.id);
  return <RentRollReport rows={rows} />;
}

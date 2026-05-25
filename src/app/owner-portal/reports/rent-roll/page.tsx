import type { Metadata } from "next";
import { Briefcase } from "lucide-react";
import { RentRollReport } from "@/components/reports/rent-roll-report";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getSessionContext } from "@/lib/auth/session";
import { listOwnerPropertyIds } from "@/lib/data/property-owners";
import { getRentRollReport } from "@/lib/data/reports/rent-roll";

export const metadata: Metadata = { title: "Rent roll" };

export default async function OwnerRentRollReportPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const propertyIds = await listOwnerPropertyIds(
    context.authUserId,
    context.organization.id,
  );

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

  const rows = await getRentRollReport(context.organization.id, {
    propertyIds,
  });
  return <RentRollReport rows={rows} backHref="/owner-portal/reports" />;
}

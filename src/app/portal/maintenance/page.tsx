import type { Metadata } from "next";
import { TenantMaintenanceView } from "@/components/portal/tenant-maintenance-view";
import { getSessionContext } from "@/lib/auth/session";
import { getTenantMaintenanceRequests } from "@/lib/data/tenant-maintenance";

export const metadata: Metadata = { title: "Maintenance" };

export default async function PortalMaintenancePage() {
  const context = await getSessionContext();
  if (!context) return null;

  const { requests, canSubmit } = await getTenantMaintenanceRequests(
    context.authUserId,
  );

  return <TenantMaintenanceView requests={requests} canSubmit={canSubmit} />;
}

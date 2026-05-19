import type { Metadata } from "next";
import { MaintenanceRequestsView } from "@/components/maintenance/maintenance-requests-view";
import { PageHeader } from "@/components/shared/page-header";
import { isStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import {
  listMaintenanceFormOptions,
  listMaintenanceRequests,
} from "@/lib/data/maintenance-requests";

export const metadata: Metadata = { title: "Maintenance" };

export default async function MaintenancePage() {
  const context = await getSessionContext();
  if (!context) return null;

  const [requests, formOptions] = await Promise.all([
    listMaintenanceRequests(context.organization.id),
    listMaintenanceFormOptions(context.organization.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenance"
        description="Every maintenance request across your portfolio."
      />
      <MaintenanceRequestsView
        requests={requests}
        propertyOptions={formOptions.properties}
        unitOptions={formOptions.units}
        tenantOptions={formOptions.tenants}
        canManage={isStaff(context.roles)}
      />
    </div>
  );
}

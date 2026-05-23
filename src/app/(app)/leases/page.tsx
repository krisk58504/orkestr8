import type { Metadata } from "next";
import { LeasesView } from "@/components/leases/leases-view";
import { PageHeader } from "@/components/shared/page-header";
import { isManager } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { listLeaseFormOptions, listLeases } from "@/lib/data/leases";

export const metadata: Metadata = { title: "Leases" };

export default async function LeasesPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const [leases, formOptions] = await Promise.all([
    listLeases(context.organization.id),
    listLeaseFormOptions(context.organization.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leases"
        description="Every lease across your portfolio."
      />
      <LeasesView
        leases={leases}
        propertyOptions={formOptions.properties}
        unitOptions={formOptions.units}
        tenantOptions={formOptions.tenants}
        canManage={isManager(context.roles)}
      />
    </div>
  );
}

import type { Metadata } from "next";
import { TenantsView } from "@/components/tenants/tenants-view";
import { PageHeader } from "@/components/shared/page-header";
import { canWriteTenants } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { listTenantFormOptions, listTenants } from "@/lib/data/tenants";

export const metadata: Metadata = { title: "Tenants" };

export default async function TenantsPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const [tenants, formOptions] = await Promise.all([
    listTenants(context.organization.id),
    listTenantFormOptions(context.organization.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenants"
        description="Every resident and prospect across your portfolio."
      />
      <TenantsView
        tenants={tenants}
        propertyOptions={formOptions.properties}
        unitOptions={formOptions.units}
        canManage={canWriteTenants(context.roles)}
      />
    </div>
  );
}

import type { Metadata } from "next";
import { PropertiesView } from "@/components/properties/properties-view";
import { PageHeader } from "@/components/shared/page-header";
import { isManager } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { listPropertiesWithStats } from "@/lib/data/properties";

export const metadata: Metadata = { title: "Properties" };

export default async function PropertiesPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const properties = await listPropertiesWithStats(context.organization.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Properties"
        description="Every property in your portfolio."
      />
      <PropertiesView
        properties={properties}
        canManage={isManager(context.roles)}
      />
    </div>
  );
}

import type { Metadata } from "next";
import { BuildingsView } from "@/components/buildings/buildings-view";
import { PageHeader } from "@/components/shared/page-header";
import { isManager } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { listBuildings, listBuildingFormOptions } from "@/lib/data/buildings";

export const metadata: Metadata = { title: "Buildings" };

export default async function BuildingsPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const [buildings, properties] = await Promise.all([
    listBuildings(context.organization.id),
    listBuildingFormOptions(context.organization.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buildings"
        description="Every building across your properties."
      />
      <BuildingsView
        buildings={buildings}
        properties={properties}
        canManage={isManager(context.roles)}
      />
    </div>
  );
}

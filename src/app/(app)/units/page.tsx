import type { Metadata } from "next";
import { UnitsView } from "@/components/units/units-view";
import { PageHeader } from "@/components/shared/page-header";
import { isManager } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { listUnits, listUnitFormOptions } from "@/lib/data/units";

export const metadata: Metadata = { title: "Units" };

export default async function UnitsPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const [units, formOptions] = await Promise.all([
    listUnits(context.organization.id),
    listUnitFormOptions(context.organization.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Units"
        description="Every unit across your properties."
      />
      <UnitsView
        units={units}
        propertyOptions={formOptions.properties}
        buildingOptions={formOptions.buildings}
        canManage={isManager(context.roles)}
      />
    </div>
  );
}

import type { Metadata } from "next";
import { ApplicationsView } from "@/components/applications/applications-view";
import { PageHeader } from "@/components/shared/page-header";
import { canWriteTenants } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import {
  listApplicationFormOptions,
  listApplications,
} from "@/lib/data/applications";
import { perfEnd, perfStart } from "@/lib/perf";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const perfT = perfStart();
  const [applications, formOptions] = await Promise.all([
    listApplications(context.organization.id),
    listApplicationFormOptions(context.organization.id),
  ]);
  perfEnd("applications.page.data", perfT, "/applications");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="Screening workflow for prospective tenants."
      />
      <ApplicationsView
        applications={applications}
        unitOptions={formOptions.units}
        leadOptions={formOptions.leads}
        canManage={canWriteTenants(context.roles)}
      />
    </div>
  );
}

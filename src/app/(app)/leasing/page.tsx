import type { Metadata } from "next";
import { LeadsView } from "@/components/leasing/leads-view";
import { PageHeader } from "@/components/shared/page-header";
import { canWriteTenants } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { listLeadFormOptions, listLeads } from "@/lib/data/leads";
import { perfEnd, perfStart } from "@/lib/perf";

export const metadata: Metadata = { title: "Leasing" };

export default async function LeasingPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const perfT = perfStart();
  const [leads, formOptions] = await Promise.all([
    listLeads(context.organization.id),
    listLeadFormOptions(context.organization.id),
  ]);
  perfEnd("leasing.page.data", perfT, "/leasing");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leasing"
        description="Prospects in your pipeline."
      />
      <LeadsView
        leads={leads}
        propertyOptions={formOptions.properties}
        assigneeOptions={formOptions.assignees}
        canManage={canWriteTenants(context.roles)}
      />
    </div>
  );
}

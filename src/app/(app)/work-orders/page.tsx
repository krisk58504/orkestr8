import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { WorkOrdersView } from "@/components/work-orders/work-orders-view";
import { isStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import {
  listWorkOrderFormOptions,
  listWorkOrders,
} from "@/lib/data/work-orders";

export const metadata: Metadata = { title: "Work Orders" };

export default async function WorkOrdersPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const [workOrders, options] = await Promise.all([
    listWorkOrders(context.organization.id),
    listWorkOrderFormOptions(context.organization.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Orders"
        description="Track and assign maintenance work across your portfolio."
      />
      <WorkOrdersView
        workOrders={workOrders}
        options={options}
        canManage={isStaff(context.roles)}
      />
    </div>
  );
}

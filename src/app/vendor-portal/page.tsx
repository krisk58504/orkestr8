import type { Metadata } from "next";
import Link from "next/link";
import {
  ClipboardList,
  FileText,
  FolderClock,
  Hourglass,
  Inbox,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionContext } from "@/lib/auth/session";
import {
  MAINTENANCE_PRIORITY_META,
  WORK_ORDER_STATUS_META,
} from "@/lib/constants";
import { getVendorPortalSummary } from "@/lib/data/vendor-portal";

export const metadata: Metadata = { title: "Vendor Dashboard" };

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleDateString();
}

export default async function VendorDashboardPage() {
  const context = await getSessionContext();
  if (!context?.vendorId) return null;

  const summary = await getVendorPortalSummary(context.vendorId);
  const firstName = context.profile.full_name?.trim().split(/\s+/)[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Vendor Dashboard"}
        description="Your assigned work, invoices, and documents at a glance."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Awaiting response"
          value={summary.assignedWorkOrders}
          icon={Inbox}
          hint="Assigned — accept or decline"
        />
        <StatCard
          label="In progress"
          value={summary.inProgressWorkOrders}
          icon={Hourglass}
          hint="Accepted or being worked"
        />
        <StatCard
          label="Open invoices"
          value={summary.openInvoices}
          icon={FileText}
          hint="Draft or submitted"
        />
        <StatCard
          label="Expiring documents"
          value={summary.expiringDocuments}
          icon={FolderClock}
          hint="Within 30 days"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent open work orders</CardTitle>
          <CardDescription>
            {summary.openWorkOrders} open work order
            {summary.openWorkOrders === 1 ? "" : "s"} assigned to you ·{" "}
            {summary.completedWorkOrders} completed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.recentOpenWorkOrders.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No open work orders"
              description="When the property-management team assigns work to your company, it will appear here."
            />
          ) : (
            <ul className="divide-y">
              {summary.recentOpenWorkOrders.map((workOrder) => {
                const statusMeta = WORK_ORDER_STATUS_META[workOrder.status];
                const priorityMeta =
                  MAINTENANCE_PRIORITY_META[workOrder.priority];
                return (
                  <li key={workOrder.id}>
                    <Link
                      href={`/vendor-portal/work-orders/${workOrder.id}`}
                      className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-foreground"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {workOrder.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {workOrder.number ? `${workOrder.number} · ` : ""}
                          {workOrder.property_name ?? "Unknown property"}
                          {workOrder.unit_number
                            ? ` · Unit ${workOrder.unit_number}`
                            : ""}{" "}
                          · Scheduled {formatDate(workOrder.scheduled_for)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge tone={priorityMeta.tone}>
                          {priorityMeta.label}
                        </StatusBadge>
                        <StatusBadge tone={statusMeta.tone}>
                          {statusMeta.label}
                        </StatusBadge>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LeadDetailEditAffordance } from "@/components/leasing/lead-detail-edit-affordance";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canWriteTenants } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { LEAD_SOURCE_META, LEAD_STATUS_META } from "@/lib/constants";
import { getLead, listLeadFormOptions } from "@/lib/data/leads";

export const metadata: Metadata = { title: "Lead" };

function formatBudget(amount: number | null): string {
  if (amount == null) return "Not set";
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const context = await getSessionContext();
  if (!context) return null;

  const lead = await getLead(context.organization.id, leadId);
  if (!lead) notFound();

  const canManage = canWriteTenants(context.roles);
  const statusMeta = LEAD_STATUS_META[lead.status];
  const sourceMeta = LEAD_SOURCE_META[lead.source];

  // Form options are only needed when the manager can edit. Conditional
  // fetch keeps the read-only path cheaper.
  const formOptions = canManage
    ? await listLeadFormOptions(context.organization.id)
    : { properties: [], assignees: [] };

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2"
          render={<Link href="/leasing" />}
        >
          <ArrowLeft className="size-4" />
          Leasing
        </Button>
        <PageHeader
          title={`${lead.first_name} ${lead.last_name}`}
          description={`Source: ${sourceMeta.label}`}
        >
          <div className="flex items-center gap-2">
            <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
            {canManage ? (
              <LeadDetailEditAffordance
                lead={lead}
                propertyOptions={formOptions.properties}
                assigneeOptions={formOptions.assignees}
              />
            ) : null}
          </div>
        </PageHeader>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Email</p>
            <p>{lead.email ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Phone</p>
            <p>{lead.phone ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Source</p>
            <p>{sourceMeta.label}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Assignee</p>
            <p>{lead.assignee_name ?? "Unassigned"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Desired property</p>
            <p>{lead.property_name ?? "No preference"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Desired move-in</p>
            <p>{lead.desired_move_in ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Desired bedrooms</p>
            <p>{lead.desired_bedrooms ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Desired budget</p>
            <p>{formatBudget(lead.desired_budget)}</p>
          </div>
          {lead.notes ? (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap">{lead.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

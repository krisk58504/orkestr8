import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { ApplicationDetailActions } from "@/components/applications/application-detail-actions";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canWriteTenants } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { APPLICATION_STATUS_META } from "@/lib/constants";
import {
  getApplication,
  listApplicationFormOptions,
} from "@/lib/data/applications";

export const metadata: Metadata = { title: "Application" };

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatIncome(amount: number | null): string {
  if (amount == null) return "Not set";
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  const context = await getSessionContext();
  if (!context) return null;

  const application = await getApplication(context.organization.id, appId);
  if (!application) notFound();

  const canManage = canWriteTenants(context.roles);
  const statusMeta = APPLICATION_STATUS_META[application.status];

  const formOptions = canManage
    ? await listApplicationFormOptions(context.organization.id)
    : {
        units: [] as { id: string; unit_number: string }[],
        leads: [] as { id: string; first_name: string; last_name: string }[],
      };

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2"
          render={<Link href="/applications" />}
        >
          <ArrowLeft className="size-4" />
          Applications
        </Button>
        <PageHeader
          title={`${application.applicant_first_name} ${application.applicant_last_name}`}
          description={
            application.unit_number
              ? `Application for unit ${application.unit_number}`
              : "Application"
          }
        >
          <div className="flex items-center gap-2">
            <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
            {canManage ? (
              <ApplicationDetailActions
                application={application}
                unitOptions={formOptions.units}
                leadOptions={formOptions.leads}
                alreadyConverted={application.converted_tenant_id !== null}
              />
            ) : null}
          </div>
        </PageHeader>
      </div>

      {application.converted_tenant_id ? (
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <CheckCircle2 className="size-5 text-emerald-600" />
            <CardTitle>Converted to tenant + lease</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/tenants`} />}
            >
              View tenant
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/leases" />}
            >
              View lease
            </Button>
            <span className="text-muted-foreground">
              Send a portal invite from the tenant page to close the loop.
            </span>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Applicant</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Email</p>
            <p>{application.applicant_email}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Phone</p>
            <p>{application.applicant_phone ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Desired move-in</p>
            <p>{application.desired_move_in ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Monthly income</p>
            <p>{formatIncome(application.monthly_income)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Employment</p>
            <p>{application.employment_status ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Background check consent</p>
            <p>{application.background_check_consent ? "Yes" : "No"}</p>
          </div>
          {application.prior_address ? (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Prior address</p>
              <p className="whitespace-pre-wrap">{application.prior_address}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workflow</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Unit</p>
            <p>{application.unit_number ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Lead</p>
            <p>{application.lead_name ?? "Walk-in (no prior lead)"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Submitted at</p>
            <p>{formatDateTime(application.submitted_at)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Decided at</p>
            <p>{formatDateTime(application.decided_at)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Decided by</p>
            <p>{application.decided_by_name ?? "—"}</p>
          </div>
          {application.decision_notes ? (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Decision notes</p>
              <p className="whitespace-pre-wrap">
                {application.decision_notes}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

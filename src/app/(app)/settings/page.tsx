import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Mail, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isOwner } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { AI_MODE_LABELS, ORG_STATUS_META, ROLE_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Settings" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const org = context.organization;
  const orgStatus = ORG_STATUS_META[org.status];
  const canManageAi = isOwner(context.roles);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Organization, safety posture, and your account."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>Details for {org.name}</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <Row label="Name">{org.name}</Row>
            <Row label="Slug">{org.slug}</Row>
            <Row label="Status">
              <StatusBadge tone={orgStatus.tone}>{orgStatus.label}</StatusBadge>
            </Row>
            <Row label="Billing email">{org.billing_email ?? "Not set"}</Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your account</CardTitle>
            <CardDescription>How you appear in this organization</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <Row label="Name">{context.profile.full_name ?? "Not set"}</Row>
            <Row label="Email">{context.email}</Row>
            <Row label="Roles">
              {context.roles.length
                ? context.roles.map((r) => ROLE_LABELS[r]).join(", ")
                : "No roles assigned"}
            </Row>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            Safety &amp; automation posture
          </CardTitle>
          <CardDescription>
            These controls are governed by the platform safety gates. They are
            intentionally read-only in the application — only the operator can
            raise them, after a documented review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Bot className="mt-0.5 size-4 text-muted-foreground" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">AI &amp; automation mode</p>
                <StatusBadge
                  tone={org.ai_mode === "disabled" ? "neutral" : "warning"}
                >
                  {AI_MODE_LABELS[org.ai_mode]}
                </StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground">
                AI defaults to disabled. No automation can send messages,
                dispatch vendors, or modify records until the mode is raised and
                the relevant module is explicitly enabled.
              </p>
              {canManageAi ? (
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/settings/ai" />}
                >
                  Manage AI mode
                  <ArrowRight className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Mail className="mt-0.5 size-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Outbound email mode</p>
                <StatusBadge
                  tone={org.email_mode === "test" ? "info" : "warning"}
                >
                  {org.email_mode === "test" ? "Test" : "Production"}
                </StatusBadge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                In test mode, outbound email is delivered only to approved test
                inboxes. Production email requires explicit operator
                configuration.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

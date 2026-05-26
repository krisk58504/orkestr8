import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AutomationFreezeSection } from "@/components/settings/automation-freeze-section";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isManager } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Automations" };

async function resolveFreezeByName(
  freezeBy: string | null,
): Promise<string | null> {
  if (!freezeBy) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("full_name, email")
    .eq("id", freezeBy)
    .maybeSingle();
  if (!data) return null;
  return data.full_name ?? data.email ?? null;
}

export default async function SettingsAutomationsPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const canEdit = isManager(context.roles);
  const org = context.organization;
  const freezeByName = await resolveFreezeByName(org.automation_freeze_by);

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        render={<Link href="/settings" />}
      >
        <ArrowLeft className="size-4" />
        Settings
      </Button>

      <PageHeader
        title="Automations"
        description="Off-switch and org-wide mode for the automation engine (Phase 7 slice 1)."
      />

      <Card>
        <CardHeader>
          <CardTitle>Organization automation controls</CardTitle>
          <CardDescription>
            Changes are audit-logged. The full list of enabled automations
            and their run history lands in a future slice — slice 1 ships
            the freeze toggle so the off-switch exists from day one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AutomationFreezeSection
            frozen={org.automation_freeze ?? false}
            mode={org.automation_mode ?? "enabled"}
            freezeAt={org.automation_freeze_at ?? null}
            freezeByName={freezeByName}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>
    </div>
  );
}

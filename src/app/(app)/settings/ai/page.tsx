import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AiModeSection } from "@/components/settings/ai-mode-section";
import { PageHeader } from "@/components/shared/page-header";
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

export const metadata: Metadata = { title: "AI safety mode" };

export default async function SettingsAiPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const canEdit = isOwner(context.roles);
  const currentMode = context.organization.ai_mode;

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
        title="AI safety mode"
        description="Set the organization-wide ceiling for AI actions (SPEC Gate 2)."
      />

      <Card>
        <CardHeader>
          <CardTitle>Organization AI mode</CardTitle>
          <CardDescription>
            Changes are audit-logged. The default `disabled` mode blocks
            every AI surface in the application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AiModeSection currentMode={currentMode} canEdit={canEdit} />
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Pause, Play, Snowflake } from "lucide-react";
import { toast } from "sonner";
import { setAutomationFreeze } from "@/app/(app)/settings/automations/actions";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AUTOMATION_MODE_LABELS } from "@/lib/constants";
import type { AutomationMode } from "@/lib/types/app";

export function AutomationFreezeSection({
  frozen,
  mode,
  freezeAt,
  freezeByName,
  canEdit,
}: {
  frozen: boolean;
  mode: AutomationMode;
  freezeAt: string | null;
  freezeByName: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function commit(nextFrozen: boolean) {
    startTransition(async () => {
      const result = await setAutomationFreeze(nextFrozen);
      if (result.ok) {
        toast.success(
          nextFrozen
            ? "Automations frozen for this organization."
            : "Automations resumed.",
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setConfirmOpen(false);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">Off-switch for all automations</p>
          <p className="text-muted-foreground">
            Freezing prevents every automation in this organization from
            sending emails, creating records, or taking any action — even
            ones currently enabled. Use this if anything is misbehaving.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Snowflake className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">Freeze status</span>
            <StatusBadge tone={frozen ? "warning" : "neutral"}>
              {frozen ? "Frozen" : "Running"}
            </StatusBadge>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Pause className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">Org mode</span>
            <StatusBadge tone={mode === "enabled" ? "info" : "neutral"}>
              {AUTOMATION_MODE_LABELS[mode]}
            </StatusBadge>
          </div>
        </div>

        {frozen && freezeAt ? (
          <p className="text-xs text-muted-foreground">
            Frozen on {new Date(freezeAt).toLocaleString()}
            {freezeByName ? ` by ${freezeByName}` : ""}.
          </p>
        ) : null}

        {canEdit ? (
          <div className="pt-1">
            {frozen ? (
              <Button
                onClick={() => commit(false)}
                disabled={pending}
                variant="default"
              >
                <Play className="size-4" />
                {pending ? "Resuming…" : "Resume automations"}
              </Button>
            ) : (
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={pending}
                variant="destructive"
              >
                <Snowflake className="size-4" />
                Freeze all automations
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Only org managers can freeze or resume automations.
          </p>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Freeze all automations for this organization?
            </AlertDialogTitle>
            <AlertDialogDescription>
              While frozen, no automation will send emails, create records,
              or take any action. You can resume at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => commit(true)}
              disabled={pending}
            >
              {pending ? "Freezing…" : "Freeze automations"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

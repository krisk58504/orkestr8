"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { runMaintenanceTriage } from "@/app/(app)/maintenance/triage-actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITY_META,
} from "@/lib/constants";
import type { MaintenanceTriageResult } from "@/lib/ai/maintenance-triage";

function formatDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function MaintenanceTriageCard({
  requestId,
  initialTriage,
  initialTriagedAt,
  canRun,
}: {
  requestId: string;
  initialTriage: MaintenanceTriageResult | null;
  initialTriagedAt: string | null;
  canRun: boolean;
}) {
  const router = useRouter();
  const [triage, setTriage] = useState(initialTriage);
  const [triagedAt, setTriagedAt] = useState(initialTriagedAt);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRun() {
    setBlockedReason(null);
    startTransition(async () => {
      const result = await runMaintenanceTriage(requestId);
      if (result.ok) {
        setTriage(result.triage);
        setTriagedAt(new Date().toISOString());
        toast.success("AI triage complete");
        router.refresh();
      } else if (result.blocked) {
        setBlockedReason(result.error);
        toast.info("AI triage was blocked by the safety gate");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Triage proposes a priority and category for this request. It is gated
        by the organization&apos;s AI safety mode (SPEC Gate 2) and produces an
        advisory suggestion only — it never changes the request.
      </p>

      {blockedReason ? (
        <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Triage blocked by the AI safety gate</p>
            <p className="text-amber-800 dark:text-amber-300">
              {blockedReason}
            </p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              This is the expected default. The attempt has been recorded in
              the AI activity log. Raise the AI mode in Settings to enable
              triage.
            </p>
          </div>
        </div>
      ) : null}

      {triage ? (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Suggested priority
            </span>
            <StatusBadge
              tone={MAINTENANCE_PRIORITY_META[triage.suggestedPriority].tone}
            >
              {MAINTENANCE_PRIORITY_META[triage.suggestedPriority].label}
            </StatusBadge>
            <span className="ml-2 text-xs font-medium text-muted-foreground">
              Suggested category
            </span>
            <StatusBadge tone="neutral">
              {MAINTENANCE_CATEGORY_LABELS[triage.suggestedCategory]}
            </StatusBadge>
          </div>

          <p className="text-sm">{triage.summary}</p>

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Urgency score</p>
              <p className="tabular-nums">{triage.urgencyScore} / 100</p>
            </div>
            <div>
              <p className="text-muted-foreground">Confidence</p>
              <p className="tabular-nums">
                {Math.round(triage.confidence * 100)}%
              </p>
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm text-muted-foreground">
              Recommended actions
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {triage.recommendedActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>

          {triage.signals.length > 0 ? (
            <div>
              <p className="mb-1 text-sm text-muted-foreground">
                Signals detected
              </p>
              <div className="flex flex-wrap gap-1.5">
                {triage.signals.map((signal) => (
                  <span
                    key={signal}
                    className="rounded bg-muted px-1.5 py-0.5 text-xs"
                  >
                    {signal}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <p className="border-t pt-3 text-xs text-muted-foreground">
            {triage.disclaimer} Model: {triage.model}
            {triagedAt ? ` · Run ${formatDateTime(triagedAt)}` : ""}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No AI triage has been run for this request yet.
        </p>
      )}

      {canRun ? (
        <Button
          type="button"
          variant={triage ? "outline" : "default"}
          onClick={handleRun}
          disabled={pending}
        >
          <Sparkles className="size-4" />
          {pending
            ? "Running triage…"
            : triage
              ? "Re-run AI triage"
              : "Run AI triage"}
        </Button>
      ) : null}
    </div>
  );
}

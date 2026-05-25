"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { generateReportInsight } from "@/app/(app)/reports/insight-actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  ReportInsightResult,
  ReportType,
  ScopeFilter,
} from "@/lib/ai/report-insight";

export type ReportInsightCardProps = {
  aiScope: { reportType: ReportType; propertyIds?: string[] };
  initialInsight: ReportInsightResult | null;
  initialGeneratedAt: string | null;
};

function formatDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function toneIcon(tone: "positive" | "neutral" | "concern") {
  if (tone === "positive") return CheckCircle2;
  if (tone === "concern") return AlertTriangle;
  return Info;
}

function toneVariant(
  tone: "positive" | "neutral" | "concern",
): "success" | "warning" | "info" {
  if (tone === "positive") return "success";
  if (tone === "concern") return "warning";
  return "info";
}

export function ReportInsightCard({
  aiScope,
  initialInsight,
  initialGeneratedAt,
}: ReportInsightCardProps) {
  const router = useRouter();
  const [insight, setInsight] = useState(initialInsight);
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRun() {
    setBlockedReason(null);
    setErrorReason(null);
    const scope: ScopeFilter = aiScope.propertyIds
      ? { propertyIds: aiScope.propertyIds }
      : {};
    startTransition(async () => {
      const result = await generateReportInsight(aiScope.reportType, scope);
      if (result.ok) {
        setInsight(result.insight);
        setGeneratedAt(result.generatedAt);
        toast.success("Insight generated");
        router.refresh();
      } else if (result.blocked) {
        setBlockedReason(result.error);
        toast.info("Insight was blocked by the AI safety gate");
      } else {
        setErrorReason(result.error);
        toast.error(result.error);
      }
    });
  }

  const buttonLabel = insight ? "Refresh insight" : "Generate insight";

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" />
          AI insight
        </CardTitle>
        <CardDescription>
          An AI-generated analysis of this report&apos;s current data.
          Advisory only — review before acting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {blockedReason ? (
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">
                Insight blocked by the AI safety gate
              </p>
              <p className="text-amber-800 dark:text-amber-300">
                {blockedReason}
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                The attempt has been recorded in the AI activity log. An
                org owner can raise the AI mode in{" "}
                <Link
                  href="/settings/ai"
                  className="underline underline-offset-2"
                >
                  Settings
                </Link>
                .
              </p>
            </div>
          </div>
        ) : null}

        {errorReason ? (
          <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Insight failed</p>
              <p>{errorReason}</p>
            </div>
          </div>
        ) : null}

        {insight ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed">{insight.headline}</p>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {insight.key_signals.map((s, idx) => {
                const Icon = toneIcon(s.trend);
                return (
                  <div
                    key={`${s.label}-${idx}`}
                    className="flex items-start gap-2 rounded-md border p-2.5 text-sm"
                  >
                    <Icon
                      className={
                        s.trend === "positive"
                          ? "mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                          : s.trend === "concern"
                            ? "mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                            : "mt-0.5 size-4 shrink-0 text-muted-foreground"
                      }
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {s.label}
                        </span>
                        <StatusBadge tone={toneVariant(s.trend)}>
                          {s.trend}
                        </StatusBadge>
                      </div>
                      <p className="font-semibold tabular-nums">{s.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {insight.notable_concerns.length > 0 ? (
              <div>
                <p className="mb-1 text-sm text-muted-foreground">
                  Notable concerns
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {insight.notable_concerns.map((c, idx) => (
                    <li key={idx}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {insight.recommended_actions.length > 0 ? (
              <div>
                <p className="mb-1 text-sm text-muted-foreground">
                  Recommended actions
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {insight.recommended_actions.map((a, idx) => (
                    <li key={idx}>{a}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="border-t pt-3 text-xs text-muted-foreground">
              {insight.disclaimer}
              {generatedAt ? ` · Generated ${formatDateTime(generatedAt)}` : ""}
            </p>
          </div>
        ) : !blockedReason ? (
          <p className="text-sm text-muted-foreground">
            No insight has been generated yet. Click below to generate
            an AI analysis of this report&apos;s current data.
          </p>
        ) : null}

        <Button
          type="button"
          variant={insight ? "outline" : "default"}
          onClick={handleRun}
          disabled={pending}
        >
          <Sparkles className="size-4" />
          {pending ? "Generating…" : buttonLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

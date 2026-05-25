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
import { generatePropertySummary } from "@/app/owner-portal/properties/[id]/actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PropertySummaryResult } from "@/lib/ai/property-summary";

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

export function PropertySummaryCard({
  propertyId,
  initialSummary,
  initialGeneratedAt,
}: {
  propertyId: string;
  initialSummary: PropertySummaryResult | null;
  initialGeneratedAt: string | null;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(initialSummary);
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRun() {
    setBlockedReason(null);
    setErrorReason(null);
    startTransition(async () => {
      const result = await generatePropertySummary(propertyId);
      if (result.ok) {
        setSummary(result.summary);
        setGeneratedAt(result.generatedAt);
        toast.success("Summary generated");
        router.refresh();
      } else if (result.blocked) {
        setBlockedReason(result.error);
        toast.info("Summary was blocked by the AI safety gate");
      } else {
        setErrorReason(result.error);
        toast.error(result.error);
      }
    });
  }

  const buttonLabel = summary ? "Refresh summary" : "Generate summary";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" />
          AI summary
        </CardTitle>
        <CardDescription>
          An AI-generated overview of this property&apos;s recent
          activity. Advisory only — review before acting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {blockedReason ? (
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Summary blocked by the AI safety gate</p>
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
              <p className="font-medium">Summary failed</p>
              <p>{errorReason}</p>
            </div>
          </div>
        ) : null}

        {summary ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed">{summary.narrative}</p>

            <div className="space-y-2">
              {summary.highlights.map((h, idx) => {
                const Icon = toneIcon(h.tone);
                return (
                  <div
                    key={`${h.label}-${idx}`}
                    className="flex items-start gap-2 rounded-md border p-2.5 text-sm"
                  >
                    <Icon
                      className={
                        h.tone === "positive"
                          ? "mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                          : h.tone === "concern"
                            ? "mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                            : "mt-0.5 size-4 shrink-0 text-muted-foreground"
                      }
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {h.label}
                        </span>
                        <StatusBadge tone={toneVariant(h.tone)}>
                          {h.tone}
                        </StatusBadge>
                      </div>
                      <p>{h.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {summary.notable_items.length > 0 ? (
              <div>
                <p className="mb-1 text-sm text-muted-foreground">
                  Notable items
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {summary.notable_items.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="border-t pt-3 text-xs text-muted-foreground">
              {summary.disclaimer}
              {generatedAt ? ` · Generated ${formatDateTime(generatedAt)}` : ""}
            </p>
          </div>
        ) : !blockedReason ? (
          <p className="text-sm text-muted-foreground">
            No summary has been generated yet. Click below to generate an
            AI overview of this property&apos;s recent activity.
          </p>
        ) : null}

        <Button
          type="button"
          variant={summary ? "outline" : "default"}
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

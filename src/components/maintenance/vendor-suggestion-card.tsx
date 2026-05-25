"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Award,
  ShieldAlert,
  Sparkles,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { generateVendorSuggestion } from "@/app/(app)/maintenance/[id]/vendor-suggestion-actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { VendorSuggestionResult } from "@/lib/ai/vendor-suggestion";

function formatDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function confidenceTone(
  c: "high" | "medium" | "low",
): "success" | "info" | "warning" {
  if (c === "high") return "success";
  if (c === "medium") return "info";
  return "warning";
}

export function VendorSuggestionCard({
  requestId,
  initialSuggestions,
  initialGeneratedAt,
  canRun,
}: {
  requestId: string;
  initialSuggestions: VendorSuggestionResult | null;
  initialGeneratedAt: string | null;
  canRun: boolean;
}) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRun() {
    setBlockedReason(null);
    setErrorReason(null);
    startTransition(async () => {
      const result = await generateVendorSuggestion(requestId);
      if (result.ok) {
        setSuggestions(result.suggestions);
        setGeneratedAt(result.generatedAt);
        toast.success("Vendor suggestions generated");
        router.refresh();
      } else if (result.blocked) {
        setBlockedReason(result.error);
        toast.info("Vendor suggestions blocked by the AI safety gate");
      } else {
        setErrorReason(result.error);
        toast.error(result.error);
      }
    });
  }

  const buttonLabel = suggestions ? "Refresh suggestions" : "Suggest vendors";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="size-4" />
          AI vendor suggestions
        </CardTitle>
        <CardDescription>
          Up to 3 ranked vendor suggestions based on trade match and recent
          performance. Advisory only — review before assigning.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {blockedReason ? (
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">
                Vendor suggestions blocked by the AI safety gate
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
              <p className="font-medium">Suggestion failed</p>
              <p>{errorReason}</p>
            </div>
          </div>
        ) : null}

        {suggestions ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed">{suggestions.headline}</p>

            <div className="space-y-2">
              {suggestions.suggestions.map((s) => (
                <div
                  key={s.vendor_id}
                  className="flex items-start gap-3 rounded-md border p-3 text-sm"
                >
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    {s.rank === 1 ? (
                      <Award className="size-4 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <span className="text-xs font-semibold tabular-nums">
                        #{s.rank}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.vendor_name}</span>
                      <StatusBadge tone={confidenceTone(s.confidence)}>
                        {s.confidence} confidence
                      </StatusBadge>
                    </div>
                    <p className="text-muted-foreground">{s.reasoning}</p>
                  </div>
                </div>
              ))}
            </div>

            {suggestions.notable_constraints.length > 0 ? (
              <div>
                <p className="mb-1 text-sm text-muted-foreground">
                  Notable constraints
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {suggestions.notable_constraints.map((c, idx) => (
                    <li key={idx}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="border-t pt-3 text-xs text-muted-foreground">
              {suggestions.disclaimer}
              {generatedAt
                ? ` · Generated ${formatDateTime(generatedAt)}`
                : ""}
            </p>
          </div>
        ) : !blockedReason ? (
          <p className="text-sm text-muted-foreground">
            No vendor suggestions have been generated yet. AI ranks vendors
            by trade match plus recent performance. Click below to generate.
          </p>
        ) : null}

        {canRun ? (
          <Button
            type="button"
            variant={suggestions ? "outline" : "default"}
            onClick={handleRun}
            disabled={pending}
          >
            <Sparkles className="size-4" />
            {pending ? "Suggesting…" : buttonLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

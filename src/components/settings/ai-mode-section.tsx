"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { setAiMode } from "@/app/(app)/settings/ai/actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AI_MODE_LABELS } from "@/lib/constants";
import type { AiMode } from "@/lib/types/app";

const MODE_DESCRIPTIONS: Record<AiMode, string> = {
  disabled:
    "AI is fully off. No model calls are made. This is the safe default.",
  draft_only:
    "AI may produce drafts of messages and content for human review. It cannot send anything.",
  suggest_only:
    "AI may produce drafts, suggestions, and summaries. It cannot take any action.",
  auto_with_approval:
    "AI may propose real actions (send_message, dispatch_vendor, etc.), but a human must approve before execution. Requires the per-module 'enabled' setting.",
  fully_automated:
    "AI may execute real actions without per-action approval. Requires the per-module 'enabled' setting. Highest blast radius.",
};

const ALL_MODES: AiMode[] = [
  "disabled",
  "draft_only",
  "suggest_only",
  "auto_with_approval",
  "fully_automated",
];

export function AiModeSection({
  currentMode,
  canEdit,
}: {
  currentMode: AiMode;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<AiMode>(currentMode);
  const [pending, startTransition] = useTransition();

  const dirty = selected !== currentMode;

  function handleSave() {
    if (!dirty) return;
    startTransition(async () => {
      const result = await setAiMode(selected);
      if (result.ok) {
        toast.success(`AI mode changed to ${AI_MODE_LABELS[result.next]}`);
        router.refresh();
      } else {
        toast.error(result.error);
        setSelected(currentMode);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">SPEC Gate 2 — AI safety posture</p>
          <p className="text-muted-foreground">
            Every AI action passes the central permission function
            (canRunAutomationAction). The mode below sets the org-wide
            ceiling. Real (side-effecting) actions additionally require
            per-module enablement.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Bot className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Current mode</span>
          <StatusBadge tone="info">{AI_MODE_LABELS[currentMode]}</StatusBadge>
        </div>

        {canEdit ? (
          <>
            <Select
              value={selected}
              onValueChange={(v) => setSelected(v as AiMode)}
              disabled={pending}
            >
              <SelectTrigger className="w-full sm:max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {AI_MODE_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {MODE_DESCRIPTIONS[selected]}
            </p>
            <div className="flex items-center gap-2 pt-2">
              <Button onClick={handleSave} disabled={!dirty || pending}>
                {pending ? "Saving…" : dirty ? "Apply change" : "No change"}
              </Button>
              {dirty ? (
                <Button
                  variant="ghost"
                  onClick={() => setSelected(currentMode)}
                  disabled={pending}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only org owners can change the AI safety mode.
          </p>
        )}
      </div>
    </div>
  );
}

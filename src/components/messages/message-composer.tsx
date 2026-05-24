"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ActionResult = { ok: true } | { ok: false; error: string };

export function MessageComposer({
  onSend,
  placeholder = "Type a message…",
}: {
  onSend: (body: string) => Promise<ActionResult>;
  placeholder?: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await onSend(trimmed);
      if (result.ok) {
        setBody("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 border-t bg-background p-3 sm:flex-row sm:items-end"
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={2}
        maxLength={4000}
        className="flex-1 resize-none"
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter to submit.
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            handleSubmit(e as unknown as React.FormEvent);
          }
        }}
      />
      <Button type="submit" disabled={pending || body.trim().length === 0}>
        <Send className="size-4" />
        {pending ? "Sending…" : "Send"}
      </Button>
    </form>
  );
}

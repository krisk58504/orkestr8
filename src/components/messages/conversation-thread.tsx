"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Message, MessageSenderRole } from "@/lib/types/app";

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return time;
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${date} · ${time}`;
}

export function ConversationThread({
  messages,
  senderSelf,
}: {
  messages: Message[];
  /** Which side of the conversation the viewer is on. */
  senderSelf: MessageSenderRole;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // Scroll to the newest message whenever the message set changes.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        No messages yet. Send one to start the conversation.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
      {messages.map((m) => {
        const isSelf = m.sender_role === senderSelf;
        return (
          <div
            key={m.id}
            className={cn(
              "flex flex-col",
              isSelf ? "items-end" : "items-start",
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                isSelf
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </div>
            <span className="mt-1 text-xs text-muted-foreground">
              {m.sender_role === "staff" ? "Property team" : "Tenant"} ·{" "}
              {formatTime(m.created_at)}
            </span>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

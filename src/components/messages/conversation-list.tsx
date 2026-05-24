import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { ConversationSummary } from "@/lib/data/messages";
import { cn } from "@/lib/utils";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ConversationList({
  conversations,
}: {
  conversations: ConversationSummary[];
}) {
  if (conversations.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        No conversations yet. Messages from tenants will appear here.
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {conversations.map((c) => {
        const unread = c.unread_count_for_staff > 0;
        const last = c.last_message;
        return (
          <li key={c.tenant.id}>
            <Link
              href={`/messages/${c.tenant.id}`}
              className="flex items-start gap-3 px-4 py-3 hover:bg-muted/60"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className={cn(
                      "truncate text-sm",
                      unread ? "font-semibold" : "font-medium",
                    )}
                  >
                    {c.tenant.first_name} {c.tenant.last_name}
                  </span>
                  {last ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatWhen(last.created_at)}
                    </span>
                  ) : null}
                </div>
                {last ? (
                  <p
                    className={cn(
                      "line-clamp-1 text-sm",
                      unread ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {last.sender_role === "staff" ? "You: " : ""}
                    {last.body}
                  </p>
                ) : null}
              </div>
              {unread ? (
                <Badge className="shrink-0">
                  {c.unread_count_for_staff}
                </Badge>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

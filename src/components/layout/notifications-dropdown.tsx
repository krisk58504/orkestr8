"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, Inbox, Info, Wrench } from "lucide-react";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/(app)/notifications/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Notification, NotificationKind } from "@/lib/types/app";

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const KIND_ICON: Partial<Record<NotificationKind, typeof Info>> = {
  "maintenance.created": Wrench,
  "work_order.assigned": Wrench,
  "automation_run.failed": AlertCircle,
};

function iconForKind(kind: string) {
  return KIND_ICON[kind as NotificationKind] ?? Info;
}

function toneClassFor(type: string): string {
  switch (type) {
    case "success":
      return "text-emerald-500";
    case "warning":
      return "text-amber-500";
    case "error":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

export function NotificationsDropdown({
  notifications,
  unreadCount,
  onAfterAction,
}: {
  notifications: Notification[];
  unreadCount: number;
  onAfterAction?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick(notification: Notification) {
    startTransition(async () => {
      if (!notification.is_read) {
        await markNotificationRead(notification.id);
      }
      onAfterAction?.();
      if (notification.link) {
        router.push(notification.link);
      }
    });
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsRead();
      onAfterAction?.();
      router.refresh();
    });
  }

  return (
    <div className="w-80 sm:w-96">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 ? (
            <p className="text-xs text-muted-foreground">
              {unreadCount} unread
            </p>
          ) : null}
        </div>
        {unreadCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={pending}
          >
            <CheckCircle className="size-3.5" />
            Mark all read
          </Button>
        ) : null}
      </div>

      <div className="max-h-[480px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No notifications yet</p>
            <p className="text-xs text-muted-foreground">
              You&apos;re all caught up.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {notifications.map((n) => {
              const Icon = iconForKind(n.kind);
              const inner = (
                <div className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-muted/40">
                  <Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      toneClassFor(n.type),
                    )}
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-sm font-medium">
                      {n.title}
                    </p>
                    {n.body ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {n.body}
                      </p>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                  {!n.is_read ? (
                    <span
                      aria-label="Unread"
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                    />
                  ) : null}
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link
                      href={n.link}
                      onClick={(e) => {
                        e.preventDefault();
                        handleClick(n);
                      }}
                      className="block"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className="block w-full"
                    >
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

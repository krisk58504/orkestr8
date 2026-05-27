"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { NotificationsDropdown } from "./notifications-dropdown";
import type { Notification } from "@/lib/types/app";

/**
 * Topbar bell — server-rendered props (no client flicker on first paint),
 * refreshes via router.refresh() on window focus + after each action.
 *
 * Real-time subscriptions are explicitly out of scope for slice 2 per
 * docs/PHASE_7_SLICE_2_AUDIT.md §G — poll-on-events only (poll = focus
 * event and post-action revalidation).
 */
export function NotificationBell({
  recent,
  unreadCount,
}: {
  recent: Notification[];
  unreadCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => router.refresh();
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, [router]);

  const badge = unreadCount > 0;
  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              badge ? `Notifications (${unreadCount} unread)` : "Notifications"
            }
            className="relative"
          />
        }
      >
        <Bell className="size-5" />
        {badge ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
          >
            {badgeLabel}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <NotificationsDropdown
          notifications={recent}
          unreadCount={unreadCount}
          onAfterAction={() => router.refresh()}
        />
      </PopoverContent>
    </Popover>
  );
}

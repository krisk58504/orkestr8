import "server-only";
import type { Json } from "@/lib/types/database";
import type { NotificationKind } from "@/lib/types/app";

/**
 * Parameters for produceNotification (single-recipient insert).
 *
 * Multi-recipient broadcasts call this helper in a loop (N rows per
 * recipient — see docs/PHASE_7_SLICE_2_AUDIT.md §G.4).
 */
export type ProduceNotificationParams = {
  organizationId: string;
  /** Recipient — the user the notification is for. */
  userId: string;
  /**
   * Actor — the user whose action triggered the event. When provided,
   * the helper skips the insert if `userId === actorUserId` (self-skip
   * per §G.8). Omit when there's no actor (e.g., system cron runner).
   */
  actorUserId?: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  type?: "info" | "success" | "warning" | "error";
  link?: string;
  metadata?: Json;
};

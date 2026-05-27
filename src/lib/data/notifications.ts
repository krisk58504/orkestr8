import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/lib/types/app";

/**
 * Phase 7 slice 2 — notifications data layer (RLS-respecting reads).
 *
 * The producer (`src/lib/notifications/produce.ts`) uses the admin
 * client because actor != recipient; these read/mutate helpers use the
 * session client because the recipient IS auth.uid() and the existing
 * Phase 1 RLS policies authorize them.
 */

export async function listRecentForUser(
  limit = 15,
): Promise<Notification[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getUnreadCountForUser(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("is_read", false);
  return count ?? 0;
}

/**
 * Combined fetch for the bell dropdown: latest N + total unread count.
 * One round-trip-pair on the server side; client gets both in one prop.
 */
export async function loadNotificationBellData(limit = 15): Promise<{
  recent: Notification[];
  unreadCount: number;
}> {
  const [recent, unreadCount] = await Promise.all([
    listRecentForUser(limit),
    getUnreadCountForUser(),
  ]);
  return { recent, unreadCount };
}

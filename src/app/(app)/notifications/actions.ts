"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Mark a single notification as read.
 *
 * Uses the session client (not admin) — the existing per-user RLS
 * UPDATE policy (`user_id = auth.uid()`) authorizes the recipient
 * to mutate their own rows. See audit §5.3.
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  return { ok: true };
}

/**
 * Mark every unread notification for the current user as read.
 * RLS narrows the UPDATE to auth.uid()'s own rows automatically.
 */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("is_read", false);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  return { ok: true };
}

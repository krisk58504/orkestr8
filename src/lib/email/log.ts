/**
 * email/log.ts — records every outbound email attempt (SPEC Gate 3).
 *
 * Every attempt is logged, including those blocked by the allowlist or
 * suppressed as duplicates. Uses the service-role client because email_log
 * has no client INSERT policy — only trusted server code may append.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailMode, EmailStatus, OutboundEmail } from "./types";

/** Insert one email_log row. Returns the row id, or null if logging failed. */
export async function logEmailAttempt(
  email: OutboundEmail,
  mode: EmailMode,
  status: EmailStatus,
  reason: string,
): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("email_log")
      .insert({
        organization_id: email.organizationId,
        to_address: email.to,
        subject: email.content.subject,
        template: email.template,
        status,
        mode,
        reason,
        related_entity_type: email.relatedEntityType ?? null,
        related_entity_id: email.relatedEntityId ?? null,
        payload: (email.payload ?? {}) as Record<string, never>,
      })
      .select("id")
      .single();
    return data?.id ?? null;
  } catch {
    // Logging must never throw into the caller's flow.
    return null;
  }
}

/**
 * Duplicate-send protection (anti-loop, SPEC Gate 3): true when an equivalent
 * email — same recipient, template, and related entity — was already logged
 * with a non-terminal status within `windowMinutes`.
 */
export async function isDuplicateRecentSend(
  email: OutboundEmail,
  windowMinutes = 10,
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const since = new Date(
      Date.now() - windowMinutes * 60 * 1000,
    ).toISOString();

    let query = admin
      .from("email_log")
      .select("id")
      .eq("to_address", email.to)
      .eq("template", email.template)
      .in("status", ["queued", "sent"])
      .gte("created_at", since)
      .limit(1);

    query = email.relatedEntityId
      ? query.eq("related_entity_id", email.relatedEntityId)
      : query.is("related_entity_id", null);

    const { data } = await query;
    return (data?.length ?? 0) > 0;
  } catch {
    // On an unreadable log, do not suppress — let the send gates decide.
    return false;
  }
}

/**
 * email/log.ts — records every outbound email attempt (SPEC Gate 3).
 *
 * Every attempt is logged, including those blocked by the allowlist or
 * suppressed as duplicates. Uses the service-role client because email_log
 * has no client INSERT policy — only trusted server code may append.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  DuplicateCheck,
  EmailMode,
  EmailStatus,
  OutboundEmail,
} from "./types";

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
 * Duplicate-send protection (anti-loop, SPEC Gate 3). Looks for an equivalent
 * email — same recipient, template, and related entity — logged with a
 * non-terminal status within `windowMinutes`.
 *
 * Fails CLOSED (EMAIL_SAFETY.md §5 item 1). Three outcomes:
 *   - 'unique'       — proceed.
 *   - 'duplicate'    — caller must suppress.
 *   - 'unverifiable' — the email_log could not be read or returned an error;
 *                      caller MUST treat as a block, not send. An unsendable
 *                      email is recoverable; a runaway loop is not.
 *
 * The supabase-js client returns `{ data, error }` for query failures — those
 * are NOT thrown — so we explicitly inspect `error` and convert it into the
 * unverifiable branch alongside any JS exception caught by the try.
 */
export async function checkRecentDuplicate(
  email: OutboundEmail,
  windowMinutes = 10,
): Promise<DuplicateCheck> {
  try {
    // Test seam — never set in production. When set, simulates an unreadable
    // email_log so the fail-closed path can be exercised end-to-end. See
    // scripts/test-email.ts.
    if (process.env.EMAIL_DEDUP_FORCE_FAIL === "1") {
      throw new Error(
        "EMAIL_DEDUP_FORCE_FAIL — simulated unreadable email_log",
      );
    }

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

    const { data, error } = await query;
    if (error) {
      // supabase-js surfaces query failures via the error field, not by
      // throwing. Promote that to the unverifiable branch.
      throw new Error(error.message);
    }
    return (data?.length ?? 0) > 0
      ? { kind: "duplicate" }
      : { kind: "unique" };
  } catch (err) {
    return {
      kind: "unverifiable",
      error: err instanceof Error ? err.message : "unknown error",
    };
  }
}

/**
 * email/types.ts — shared types for the outbound email structure (SPEC Gate 3).
 *
 * Pure type module: no I/O, safe to import anywhere.
 */

/** Mirrors the `public.email_mode` enum. */
export type EmailMode = "test" | "production";

/** Rendered email body — produced by a template builder. */
export type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

/**
 * email_log.status values.
 * - queued     — the email_log column default; not produced by sendEmail()
 *                now that the send path is wired.
 * - sent       — accepted by the provider (logged after it responds).
 * - blocked    — dropped by the test-mode allowlist or the test-mode-only guard.
 * - suppressed — dropped by duplicate-send protection.
 * - failed     — the provider rejected or errored on the send.
 */
export type EmailStatus = "queued" | "sent" | "blocked" | "suppressed" | "failed";

/** A fully-prepared outbound email handed to sendEmail(). */
export type OutboundEmail = {
  to: string;
  /** Org the email belongs to, for the email_log row. Null for system mail. */
  organizationId: string | null;
  /** Stable template id, e.g. "work_order.assigned". */
  template: string;
  content: EmailContent;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  /** Structured context stored on the email_log row (no secrets). */
  payload?: Record<string, unknown>;
};

/** Outcome of a sendEmail() call. */
export type EmailSendResult = {
  /** True only when the provider actually accepted the message. */
  delivered: boolean;
  status: EmailStatus;
  mode: EmailMode;
  /** Human-readable explanation of the outcome. */
  reason: string;
};

/**
 * Result of checkRecentDuplicate(). Fails CLOSED (EMAIL_SAFETY.md §5 item 1):
 * - 'unique'       — no equivalent message in the window; safe to proceed.
 * - 'duplicate'    — an equivalent message was sent recently; suppress.
 * - 'unverifiable' — the email_log could not be read or returned an error.
 *                    The caller MUST treat this as a block (do not send) —
 *                    an unsendable email is recoverable; a runaway loop to
 *                    real recipients is not.
 */
export type DuplicateCheck =
  | { kind: "unique" }
  | { kind: "duplicate" }
  | { kind: "unverifiable"; error: string };

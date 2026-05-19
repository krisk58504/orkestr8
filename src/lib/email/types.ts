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
 * - queued     — passed every gate; awaiting an actual send path (not wired).
 * - sent       — delivered by the provider.
 * - blocked    — dropped by the test-mode allowlist.
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

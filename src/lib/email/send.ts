/**
 * email/send.ts — the single outbound email chokepoint (SPEC Gate 3).
 *
 * sendEmail() runs every safety gate an outbound message must pass:
 *   1. duplicate-send suppression — fails CLOSED on unverifiable (an
 *      unreadable email_log blocks the send rather than letting it through)
 *   2. test-mode recipient allowlisting
 *   3. test-mode-only guard (the wired send path is authorized for test mode
 *      only — see EMAIL_SAFETY.md section 5)
 *   4. delivery via Resend, then logging the provider's verdict to email_log
 *
 * The Resend send path is WIRED and ACTIVE for `test` mode only. In any other
 * mode the message is blocked before delivery. The status (`sent`/`failed`) is
 * logged AFTER the provider responds — never a pre-emptive `queued`.
 */
import "server-only";
import { Resend } from "resend";
import {
  getEmailMode,
  getFromAddress,
  isRecipientAllowed,
  normalizeAddress,
} from "./config";
import { checkRecentDuplicate, logEmailAttempt } from "./log";
import type { EmailSendResult, OutboundEmail } from "./types";

/**
 * Prepare and gate an outbound email. Returns the outcome; never throws for an
 * ordinary blocked/suppressed/failed result.
 */
export async function sendEmail(
  email: OutboundEmail,
): Promise<EmailSendResult> {
  const mode = getEmailMode();

  // --- Gate 1: duplicate-send suppression (automation-loop protection) ---
  // Fails CLOSED (EMAIL_SAFETY.md §5 item 1): if the dedup check cannot
  // verify uniqueness, the message is BLOCKED, not sent. An unsendable
  // email is recoverable; a runaway loop to real recipients is not.
  const dup = await checkRecentDuplicate(email);
  if (dup.kind === "duplicate") {
    const reason =
      "Suppressed — an equivalent email was already sent recently.";
    await logEmailAttempt(email, mode, "suppressed", reason);
    return { delivered: false, status: "suppressed", mode, reason };
  }
  if (dup.kind === "unverifiable") {
    const reason =
      "Blocked — duplicate-suppression check could not verify this is " +
      `not a replay; failing closed. (${dup.error})`;
    await logEmailAttempt(email, mode, "blocked", reason);
    return { delivered: false, status: "blocked", mode, reason };
  }
  // dup.kind === "unique" — proceed.

  // --- Gate 2: test-mode recipient allowlist ---
  if (!isRecipientAllowed(email.to)) {
    const reason =
      "Blocked — recipient is not on the APPROVED_TEST_EMAILS allowlist " +
      "and EMAIL_MODE is not 'production'.";
    await logEmailAttempt(email, mode, "blocked", reason);
    return { delivered: false, status: "blocked", mode, reason };
  }

  // --- Gate 3: the wired send path is authorized for TEST MODE ONLY ---
  // Production sending stays blocked here until the EMAIL_SAFETY.md
  // blocking-before-production items are resolved and signed off.
  if (mode !== "test") {
    const reason =
      "Blocked — the Resend send path is authorized for test mode only; " +
      "production sending is not yet permitted (see EMAIL_SAFETY.md).";
    await logEmailAttempt(email, mode, "blocked", reason);
    return { delivered: false, status: "blocked", mode, reason };
  }

  // --- Deliver, then log the provider's verdict (after it responds) ---
  try {
    const { providerId } = await deliverViaResend(email);
    const reason = `Sent via Resend (message id ${providerId}).`;
    // Record the provider id on the email_log payload.
    const delivered: OutboundEmail = {
      ...email,
      payload: { ...(email.payload ?? {}), provider: "resend", providerId },
    };
    await logEmailAttempt(delivered, mode, "sent", reason);
    return { delivered: true, status: "sent", mode, reason };
  } catch (err) {
    const reason = `Failed — ${
      err instanceof Error ? err.message : "unknown send error"
    }.`;
    await logEmailAttempt(email, mode, "failed", reason);
    return { delivered: false, status: "failed", mode, reason };
  }
}

/**
 * Deliver one email via the Resend provider.
 *
 * Uses the dev/test RESEND_API_KEY from the environment. Returns the Resend
 * message id on success; throws on a missing key, a provider rejection, or a
 * network error — sendEmail() catches that and logs the attempt as `failed`.
 *
 * This is reached only after every gate in sendEmail() has passed, including
 * the test-mode-only guard.
 */
export async function deliverViaResend(
  email: OutboundEmail,
): Promise<{ providerId: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set — cannot send.");
  }

  const resend = new Resend(apiKey);
  // Normalize for the Resend handoff only — Resend's sandbox sender does an
  // exact-case match against the verified account email, while RFC-5321 makes
  // the local-part case-insensitive. email_log keeps the original input on
  // email.to for audit fidelity (so future queries can match user state).
  const { data, error } = await resend.emails.send({
    from: getFromAddress(),
    to: normalizeAddress(email.to),
    subject: email.content.subject,
    html: email.content.html,
    text: email.content.text,
  });

  if (error) {
    throw new Error(`Resend rejected the message: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error("Resend returned no message id.");
  }
  return { providerId: data.id };
}

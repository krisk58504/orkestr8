/**
 * email/send.ts — the single outbound email chokepoint (SPEC Gate 3).
 *
 * sendEmail() runs every safety gate an outbound message must pass:
 *   1. duplicate-send suppression (anti-loop protection)
 *   2. mode resolution (test vs production)
 *   3. test-mode recipient allowlisting
 *   4. logging of the attempt to email_log
 *
 * It then reaches the SEND SEAM. The actual provider call (Resend) is
 * intentionally NOT wired — see the banner below and EMAIL_SAFETY.md. Until a
 * human completes the Gate 3 checklist, a permitted message is logged with
 * status 'queued' and sendEmail() returns delivered:false.
 *
 * Nothing in this module can deliver mail. That is by design.
 */
import "server-only";
import { getEmailMode, isRecipientAllowed } from "./config";
import { isDuplicateRecentSend, logEmailAttempt } from "./log";
import type { EmailSendResult, OutboundEmail } from "./types";

/**
 * Prepare and gate an outbound email. Returns the outcome; never throws for an
 * ordinary blocked/suppressed/queued result.
 */
export async function sendEmail(
  email: OutboundEmail,
): Promise<EmailSendResult> {
  const mode = getEmailMode();

  // --- Gate 1: duplicate-send suppression (automation-loop protection) ---
  if (await isDuplicateRecentSend(email)) {
    const reason =
      "Suppressed — an equivalent email was already sent recently.";
    await logEmailAttempt(email, mode, "suppressed", reason);
    return { delivered: false, status: "suppressed", mode, reason };
  }

  // --- Gate 2/3: test-mode recipient allowlist ---
  if (!isRecipientAllowed(email.to)) {
    const reason =
      "Blocked — recipient is not on the APPROVED_TEST_EMAILS allowlist " +
      "and EMAIL_MODE is not 'production'.";
    await logEmailAttempt(email, mode, "blocked", reason);
    return { delivered: false, status: "blocked", mode, reason };
  }

  // =========================================================================
  // ███  EMAIL SEND SEAM — INTENTIONALLY NOT WIRED (SPEC Gate 3)  ███
  //
  // The recipient has passed every gate. The next step is the actual Resend
  // API call. It is deliberately NOT implemented here.
  //
  // Per SPEC.md Gate 3 and EMAIL_SAFETY.md, wiring a live send path — even in
  // test mode — requires explicit human sign-off and the Gate 3 checklist.
  // Until then, a permitted message is recorded as 'queued' and NOT sent.
  //
  // To wire delivery (only after sign-off):
  //   1. `npm install resend`
  //   2. implement deliverViaResend() below with a separate prod/test key
  //   3. call it here; on success log 'sent', on error log 'failed'
  // =========================================================================
  const reason =
    "Queued — passed all gates. Send path not wired (SPEC Gate 3); " +
    "no message was delivered. See EMAIL_SAFETY.md.";
  await logEmailAttempt(email, mode, "queued", reason);
  return { delivered: false, status: "queued", mode, reason };
}

/**
 * SEND SEAM placeholder. This is where the Resend provider call belongs.
 *
 * It is deliberately unimplemented and unreferenced: calling it throws. It
 * exists only to document the contract of the missing send path. Do not
 * implement this without completing the EMAIL_SAFETY.md Gate 3 checklist.
 */
export async function deliverViaResend(_email: OutboundEmail): Promise<never> {
  void _email;
  throw new Error(
    "Email send path is not wired (SPEC Gate 3). " +
      "See EMAIL_SAFETY.md before implementing deliverViaResend().",
  );
}

/**
 * email/config.ts — outbound email configuration & the test-mode allowlist.
 *
 * Deny-by-default (SPEC Gate 3): the mode is 'test' unless EMAIL_MODE is set
 * exactly to 'production', and in test mode only addresses on
 * APPROVED_TEST_EMAILS are permitted recipients.
 */
import "server-only";
import type { EmailMode } from "./types";

/**
 * Resolve the outbound email mode. Anything other than the literal string
 * "production" — unset, empty, "test", a typo — resolves to "test".
 */
export function getEmailMode(): EmailMode {
  return process.env.EMAIL_MODE === "production" ? "production" : "test";
}

/** Normalized address: trimmed + lower-cased. */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Comparison form of an address for the allowlist check: a normalized address
 * with any plus-tag stripped from the local-part. Gmail (and most providers)
 * route every plus-aliased form to the same inbox, so for the purposes of
 * deciding "is this person on the allowlist?" they're the same address.
 * Used ONLY by isRecipientAllowed — the address handed to the email provider
 * keeps its plus-tag so the provider delivers to the right alias.
 */
function stripPlusTag(normalized: string): string {
  const atIdx = normalized.indexOf("@");
  if (atIdx <= 0) return normalized;
  const local = normalized.slice(0, atIdx);
  const domain = normalized.slice(atIdx);
  const plusIdx = local.indexOf("+");
  return plusIdx === -1 ? normalized : `${local.slice(0, plusIdx)}${domain}`;
}

/**
 * Parsed APPROVED_TEST_EMAILS allowlist (comma- or whitespace-separated).
 * Empty when the env var is unset — which, in test mode, blocks all sends.
 */
export function getApprovedTestEmails(): string[] {
  const raw = process.env.APPROVED_TEST_EMAILS ?? "";
  return raw
    .split(/[,\s]+/)
    .map((entry) => normalizeAddress(entry))
    .filter((entry) => entry.length > 0);
}

/**
 * Whether production sending is explicitly authorized (Gate 3, two-key).
 * Deny-by-default: only the literal "true" authorizes; unset/empty/"TRUE"/
 * "1"/"yes"/typo → false → blocked. Mirrors getEmailMode()'s posture.
 */
export function isProductionSendAuthorized(): boolean {
  return process.env.EMAIL_PRODUCTION_SEND_AUTHORIZED === "true";
}

/**
 * Whether recipient restriction is lifted (full launch). Deny-by-default:
 * only the literal "true" opens; anything else keeps the allowlist enforced.
 */
export function isOpenSendEnabled(): boolean {
  return process.env.EMAIL_OPEN_SEND === "true";
}

/**
 * Parsed production allowlist (comma/whitespace-separated). Empty when the
 * env var is unset — which, because isRecipientAllowed treats an empty
 * allowlist as "nobody", blocks all production sends until it is populated
 * OR EMAIL_OPEN_SEND=true is set. Deny-by-default: absence => nobody.
 */
export function getProductionAllowlist(): string[] {
  const raw = process.env.EMAIL_PRODUCTION_ALLOWLIST ?? "";
  return raw
    .split(/[,\s]+/)
    .map((entry) => normalizeAddress(entry))
    .filter((entry) => entry.length > 0);
}

/**
 * Whether `address` may receive mail under the current mode.
 * - production: any address is permitted (a human raised the mode).
 * - test: only addresses on the APPROVED_TEST_EMAILS allowlist. Plus-tag
 *   aliases are treated as the same inbox as their base address — a single
 *   allowlist entry covers every +alias of itself.
 */
export function isRecipientAllowed(address: string): boolean {
  if (getEmailMode() === "production") return true;
  const recipientBase = stripPlusTag(normalizeAddress(address));
  return getApprovedTestEmails()
    .map(stripPlusTag)
    .includes(recipientBase);
}

/**
 * Verified sender address for outbound mail. Reads EMAIL_FROM when set;
 * otherwise falls back to Resend's shared test sender, which works without a
 * verified domain — appropriate for test mode.
 */
export function getFromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || "Orkestr8 <onboarding@resend.dev>";
}

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
 * Whether `address` may receive mail under the current mode.
 * - production: any address is permitted (a human raised the mode).
 * - test: only addresses on the APPROVED_TEST_EMAILS allowlist.
 */
export function isRecipientAllowed(address: string): boolean {
  if (getEmailMode() === "production") return true;
  return getApprovedTestEmails().includes(normalizeAddress(address));
}

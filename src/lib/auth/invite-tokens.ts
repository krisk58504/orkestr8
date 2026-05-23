/**
 * invite-tokens.ts — token generation and hashing for tenant_invites.
 *
 * SECURITY MODEL: the raw token is sent to the recipient in the invite email
 * link and never persisted. Only the SHA-256 hash of the token is stored in
 * tenant_invites.token_hash. A DB read therefore cannot reproduce any active
 * invite — acceptance must hash the inbound token and look it up by hash.
 */
import { randomBytes, createHash } from "node:crypto";

/** 256 bits of entropy, base64url-encoded (URL/email-safe, no padding). */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 of the raw token, hex-encoded. Stored in tenant_invites.token_hash. */
export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

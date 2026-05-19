/**
 * guards.ts — server-action authorization helpers.
 *
 * These provide friendly error messages and defense-in-depth. The database's
 * RLS policies remain the authoritative enforcement layer (SPEC Gate 1).
 */
import "server-only";
import type { SessionContext } from "@/lib/types/app";
import { getSessionContext } from "./session";

export type Guard =
  | { ok: true; context: SessionContext }
  | { ok: false; error: string };

export async function requireSession(): Promise<Guard> {
  const context = await getSessionContext();
  if (!context) {
    return {
      ok: false,
      error: "Your session has expired — please sign in again.",
    };
  }
  return { ok: true, context };
}

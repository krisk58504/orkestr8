import "server-only";
import type { AutomationHandler } from "@/lib/automation/types";
import { rentChargeGenerationHandler } from "./rent-charge-generation";
import { vendorDocExpiryHandler } from "./vendor-doc-expiry";

/**
 * Handler registry — the single source of truth for "what automation
 * types exist" per PHASE_7_DECISIONS Q5 (Framing A only; no custom-rule
 * authoring UI in Phase 7). Adding a new handler in a future slice is
 * (1) write the file, (2) add one line below.
 */
const HANDLERS: Record<string, AutomationHandler> = {
  [vendorDocExpiryHandler.type]: vendorDocExpiryHandler,
  [rentChargeGenerationHandler.type]: rentChargeGenerationHandler,
};

export function getHandler(type: string): AutomationHandler | null {
  return HANDLERS[type] ?? null;
}

export function listHandlerTypes(): string[] {
  return Object.keys(HANDLERS);
}

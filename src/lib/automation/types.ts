import "server-only";
import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * Service-role-bound Supabase client. The automation runner runs as
 * service_role across all orgs; handlers receive an admin client and
 * bypass RLS uniformly. Per docs/PHASE_7_SLICE_1_AUDIT.md §6.7, the
 * service-role bypass surface is inventoried for SECURITY_REVIEW.md §15.
 */
export type AutomationAdminClient = SupabaseClient<Database>;

export type HandlerResult = {
  attempted: number;
  succeeded: number;
  skipped: number;
  failed: number;
  /** Email dedup-suppressed sends (slice 6) — not errors. */
  suppressed: number;
  /** Email safety/allowlist/mode-gated sends (slice 6) — not errors. */
  blocked: number;
};

export type HandlerRunParams = {
  automationId: string;
  organizationId: string;
  /** Raw jsonb config from the automations row; handler validates via its own Zod schema. */
  config: unknown;
};

export interface AutomationHandler {
  /** Handler-registry key matching automations.automation_type. */
  type: string;
  /** Zod schema validating the automations.config jsonb. */
  configSchema: z.ZodTypeAny;
  run(admin: AutomationAdminClient, params: HandlerRunParams): Promise<HandlerResult>;
}

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Automation } from "@/lib/types/app";

/**
 * Phase 7 slice 1 — automations data layer (RLS-respecting reads).
 *
 * The cron runner uses the service-role admin client directly (see
 * src/lib/automation/runner.ts). This module is for staff-context reads
 * that come from a request session — e.g., the /settings/automations
 * page surfacing what's enabled for the user's org.
 */

export async function listAutomations(orgId: string): Promise<Automation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("automations")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getAutomation(
  orgId: string,
  automationId: string,
): Promise<Automation | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("automations")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", automationId)
    .maybeSingle();
  return data ?? null;
}

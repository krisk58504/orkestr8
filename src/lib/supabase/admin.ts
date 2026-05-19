/**
 * Service-role Supabase client — BYPASSES Row Level Security.
 *
 * server-only: importing this from client code is a build error. Use ONLY for
 * trusted server-side operations that legitimately need to cross RLS, such as
 * writing audit_logs / ai_logs / automation_logs. Never expose it to a request
 * whose authorization has not already been checked.
 */
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

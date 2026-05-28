/**
 * invoke-runner-once.ts — one-shot CLI invocation of the Phase 7
 * automation runner. Walk-test convenience for slice 4 (and beyond)
 * when curl + CRON_SECRET is not the desired path. Bypasses ONLY
 * the HTTPS route handler + CRON_SECRET verification — every other
 * code path (runner gate chain, handler dispatch, handler logic)
 * is exercised identically.
 *
 * Run: npx tsx scripts/invoke-runner-once.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { runAllAutomations } from "@/lib/automation/runner";

(async () => {
  const summary = await runAllAutomations();
  console.log(JSON.stringify(summary, null, 2));
})();

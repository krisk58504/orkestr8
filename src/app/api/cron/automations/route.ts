import { NextResponse, type NextRequest } from "next/server";
import { runAllAutomations } from "@/lib/automation/runner";

/**
 * Phase 7 slice 1 — Vercel Cron entrypoint.
 *
 * Vercel sends `Authorization: Bearer ${CRON_SECRET}` per the cron docs.
 * Without that header, the endpoint is publicly invokable, so verification
 * is the first gate. CRON_SECRET is operator-held per SPEC line 138 +
 * docs/PHASE_7_SLICE_1_AUDIT.md §4.2.
 *
 * Schedule (vercel.json): `0 6 * * *` — daily 06:00 UTC.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "cron_secret_not_configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await runAllAutomations();
  return NextResponse.json(summary);
}

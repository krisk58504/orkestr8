/**
 * test-email.ts — manual end-to-end verification of the wired email send path.
 *
 * Exercises four cases through sendEmail() and asserts the outcome of each:
 *
 *   T1 — allowlisted recipient, fresh id → status 'sent' (reaches Resend)
 *   T2 — non-allowlisted recipient        → status 'blocked' by the allowlist
 *   T3 — repeat of T1 (same id+template)  → status 'suppressed' (real duplicate)
 *   T4 — dedup check forced to fail       → status 'blocked' (FAILS CLOSED)
 *
 * Then prints the email_log rows for all four attempts.
 *
 * TEST-MODE ONLY. Requires EMAIL_MODE=test (the default). Does not modify
 * code or schema. Run with the react-server condition so `server-only` is
 * inert:
 *
 *   NODE_OPTIONS='--conditions=react-server' npx tsx scripts/test-email.ts
 *
 * Exits 0 on all-pass, 1 on any FAIL, 2 on infrastructure error.
 */
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Client } from "pg";
import { getApprovedTestEmails, getEmailMode } from "../src/lib/email/config";
import { sendEmail } from "../src/lib/email/send";
import { maintenanceRequestReceivedEmail } from "../src/lib/email/templates";
import type { EmailSendResult, OutboundEmail } from "../src/lib/email/types";

config({ path: ".env.local" });

function buildEmail(to: string, relatedEntityId: string): OutboundEmail {
  return {
    to,
    organizationId: null,
    template: "maintenance_request.received",
    content: maintenanceRequestReceivedEmail({
      reporterName: "Test Reporter",
      requestTitle: "Send-path verification",
      propertyName: "Test Property",
      category: "General",
      priority: "Low",
    }),
    relatedEntityType: "email_test",
    relatedEntityId,
  };
}

let failed = 0;
function check(
  id: string,
  desc: string,
  condition: boolean,
  ctx?: unknown,
): void {
  if (condition) {
    console.log(`  ${id} PASS: ${desc}`);
  } else {
    failed += 1;
    console.error(
      `  ${id} FAIL: ${desc}${ctx === undefined ? "" : " — got " + JSON.stringify(ctx)}`,
    );
  }
}

async function main() {
  const mode = getEmailMode();
  console.log(`EMAIL_MODE resolved to: ${mode}`);
  if (mode !== "test") {
    console.error("ABORT: refusing to run unless EMAIL_MODE is 'test'.");
    process.exit(2);
  }

  const allowlist = getApprovedTestEmails();
  const allowed = allowlist[0];
  if (!allowed) {
    console.error("ABORT: APPROVED_TEST_EMAILS is empty.");
    process.exit(2);
  }
  const blocked = "blocked-recipient@example.com";
  console.log(`Allowlisted recipient:     ${allowed}`);
  console.log(`Non-allowlisted recipient: ${blocked}\n`);

  // Distinct ids per scenario; T3 deliberately reuses T1's id.
  const id1 = randomUUID();
  const id2 = randomUUID();
  const id4 = randomUUID();

  const e1 = buildEmail(allowed, id1);
  const e2 = buildEmail(blocked, id2);
  const e3 = buildEmail(allowed, id1); // same id as e1 — should suppress
  const e4 = buildEmail(allowed, id4);

  // --- T1: allowlisted, fresh id ---
  console.log("--- T1. Send to allowlisted address (fresh id) ---");
  const r1 = await sendEmail(e1);
  console.log(JSON.stringify(r1, null, 2));
  check("T1.a", "status is 'sent'", r1.status === "sent", r1.status);
  check("T1.b", "delivered=true", r1.delivered === true, r1.delivered);
  check(
    "T1.c",
    "reason mentions Resend message id",
    /Sent via Resend.*message id/i.test(r1.reason),
    r1.reason,
  );

  // --- T2: non-allowlisted, fresh id ---
  console.log("\n--- T2. Send to non-allowlisted address (fresh id) ---");
  const r2 = await sendEmail(e2);
  console.log(JSON.stringify(r2, null, 2));
  check("T2.a", "status is 'blocked'", r2.status === "blocked", r2.status);
  check("T2.b", "delivered=false", r2.delivered === false, r2.delivered);
  check(
    "T2.c",
    "reason mentions APPROVED_TEST_EMAILS allowlist",
    /APPROVED_TEST_EMAILS/.test(r2.reason),
    r2.reason,
  );

  // --- T3: duplicate of T1 — same to + template + related_entity_id ---
  console.log("\n--- T3. Resend T1 verbatim (same id) — expect suppression ---");
  const r3 = await sendEmail(e3);
  console.log(JSON.stringify(r3, null, 2));
  check(
    "T3.a",
    "status is 'suppressed'",
    r3.status === "suppressed",
    r3.status,
  );
  check("T3.b", "delivered=false", r3.delivered === false, r3.delivered);
  check(
    "T3.c",
    "reason mentions duplicate / equivalent",
    /already sent recently|duplicate|equivalent/i.test(r3.reason),
    r3.reason,
  );

  // --- T4: dedup check forced to fail (unverifiable) — must FAIL CLOSED ---
  console.log(
    "\n--- T4. Force dedup-check failure (EMAIL_DEDUP_FORCE_FAIL=1) — expect blocked, NOT sent ---",
  );
  process.env.EMAIL_DEDUP_FORCE_FAIL = "1";
  let r4: EmailSendResult;
  try {
    r4 = await sendEmail(e4);
  } finally {
    delete process.env.EMAIL_DEDUP_FORCE_FAIL;
  }
  console.log(JSON.stringify(r4, null, 2));
  check("T4.a", "status is 'blocked'", r4.status === "blocked", r4.status);
  check("T4.b", "delivered=false", r4.delivered === false, r4.delivered);
  check(
    "T4.c",
    "reason indicates the dedup check could not verify (fail-closed)",
    /could not verify|failing closed|unverifiable/i.test(r4.reason),
    r4.reason,
  );

  // --- Read all four email_log rows back ---
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();
  const { rows } = await pg.query(
    `select id, to_address, subject, template, status, mode, reason,
            related_entity_type, related_entity_id, payload, created_at
       from public.email_log
      where related_entity_id = any($1::uuid[])
      order by created_at`,
    [[id1, id2, id4]], // id1 covers both T1 (sent) and T3 (suppressed)
  );
  await pg.end();

  console.log(`\n--- email_log rows (${rows.length}) ---`);
  console.log(JSON.stringify(rows, null, 2));

  // Per-row structural assertions: every attempt must be logged.
  const t1Rows = rows.filter(
    (r) => r.related_entity_id === id1 && r.status === "sent",
  );
  const t2Rows = rows.filter((r) => r.related_entity_id === id2);
  const t3Rows = rows.filter(
    (r) => r.related_entity_id === id1 && r.status === "suppressed",
  );
  const t4Rows = rows.filter((r) => r.related_entity_id === id4);

  check("LOG.T1", "T1 logged with status=sent", t1Rows.length === 1);
  check(
    "LOG.T1.payload",
    "T1 row payload has provider=resend + providerId",
    t1Rows.length === 1 &&
      t1Rows[0].payload?.provider === "resend" &&
      typeof t1Rows[0].payload?.providerId === "string",
    t1Rows[0]?.payload,
  );
  check(
    "LOG.T2",
    "T2 logged with status=blocked (allowlist)",
    t2Rows.length === 1 && t2Rows[0].status === "blocked",
    t2Rows.map((r) => r.status),
  );
  check(
    "LOG.T3",
    "T3 logged with status=suppressed",
    t3Rows.length === 1,
    t3Rows.map((r) => r.status),
  );
  check(
    "LOG.T4",
    "T4 logged with status=blocked (unverifiable dedup)",
    t4Rows.length === 1 && t4Rows[0].status === "blocked",
    t4Rows.map((r) => r.status),
  );

  console.log(`\n${failed === 0 ? "PASSED" : "FAILED"} — ${failed} failures.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`Runner error: ${(e as Error).message}`);
  process.exit(2);
});

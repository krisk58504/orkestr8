/**
 * test-email.ts — one-off manual verification of the wired email send path.
 *
 * Sends two emails through sendEmail(): one to an allowlisted address (which
 * should reach Resend) and one to a non-allowlisted address (which must be
 * blocked before the provider). Then prints the resulting email_log rows.
 *
 * TEST-MODE ONLY. Requires EMAIL_MODE=test (the default). Does not modify code
 * or schema. Run with the react-server condition so `server-only` is inert:
 *
 *   NODE_OPTIONS='--conditions=react-server' npx tsx scripts/test-email.ts
 */
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Client } from "pg";
import { getApprovedTestEmails, getEmailMode } from "../src/lib/email/config";
import { sendEmail } from "../src/lib/email/send";
import { maintenanceRequestReceivedEmail } from "../src/lib/email/templates";
import type { OutboundEmail } from "../src/lib/email/types";

config({ path: ".env.local" });

function buildEmail(to: string): OutboundEmail {
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
    // Fresh id per run so duplicate-suppression does not skip a re-run.
    relatedEntityId: randomUUID(),
  };
}

async function main() {
  const mode = getEmailMode();
  console.log(`EMAIL_MODE resolved to: ${mode}`);
  if (mode !== "test") {
    console.error("ABORT: refusing to run unless EMAIL_MODE is 'test'.");
    process.exit(1);
  }

  const allowlist = getApprovedTestEmails();
  const allowed = allowlist[0];
  if (!allowed) {
    console.error("ABORT: APPROVED_TEST_EMAILS is empty.");
    process.exit(1);
  }
  const blocked = "blocked-recipient@example.com";
  console.log(`Allowlisted recipient:     ${allowed}`);
  console.log(`Non-allowlisted recipient: ${blocked}\n`);

  const allowedEmail = buildEmail(allowed);
  const blockedEmail = buildEmail(blocked);

  console.log("--- Sending to the allowlisted address ---");
  const r1 = await sendEmail(allowedEmail);
  console.log(JSON.stringify(r1, null, 2));

  console.log("\n--- Sending to the non-allowlisted address ---");
  const r2 = await sendEmail(blockedEmail);
  console.log(JSON.stringify(r2, null, 2));

  // Read the two rows back from email_log.
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const { rows } = await client.query(
    `select id, to_address, subject, template, status, mode, reason,
            related_entity_type, related_entity_id, payload, created_at
       from public.email_log
      where related_entity_id = any($1::uuid[])
      order by created_at`,
    [[allowedEmail.relatedEntityId, blockedEmail.relatedEntityId]],
  );
  await client.end();

  console.log(`\n--- email_log rows (${rows.length}) ---`);
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((e) => {
  console.error(`Runner error: ${(e as Error).message}`);
  process.exit(2);
});

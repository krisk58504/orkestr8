/**
 * test-email-wired.ts — loop-proof check on the WIRED notification path.
 *
 * Drives `notifyWorkOrderStatusChanged()` (the same helper that the
 * work-orders / vendor-portal actions call) TWICE in rapid succession on
 * the SAME work order, with the SAME recipient and template, and proves
 * that:
 *
 *   E1  — the first notification is sent (reaches Resend).
 *   E2  — the second is SUPPRESSED by sendEmail()'s dedup before reaching
 *         the provider.
 *
 * This is the action-layer loop-proof guarantee, not just the isolated
 * sendEmail() behaviour: if a server action fires the same notification
 * twice in a row — by retry, double-click, or runaway automation —
 * dedup collapses it to a single outbound email.
 *
 * TEST-MODE ONLY. Requires EMAIL_MODE=test, an allowlisted recipient,
 * and the service-role key. Seeds a tiny fixture (org + property +
 * vendor + WO) via the admin client and cascades it on cleanup.
 *
 *   NODE_OPTIONS='--conditions=react-server' npx tsx scripts/test-email-wired.ts
 *
 * Exits 0 on all-pass, 1 on any FAIL, 2 on infrastructure error.
 */
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Client } from "pg";
import { getApprovedTestEmails, getEmailMode } from "../src/lib/email/config";
import { notifyWorkOrderStatusChanged } from "../src/lib/email/notifications";
import { createAdminClient } from "../src/lib/supabase/admin";

config({ path: ".env.local" });

let failed = 0;
function check(id: string, desc: string, ok: boolean, ctx?: unknown): void {
  if (ok) {
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
  if (mode !== "test") {
    console.error("ABORT: refusing to run unless EMAIL_MODE is 'test'.");
    process.exit(2);
  }
  const recipient = getApprovedTestEmails()[0];
  if (!recipient) {
    console.error("ABORT: APPROVED_TEST_EMAILS is empty.");
    process.exit(2);
  }

  const admin = createAdminClient();

  // Fresh ids per run — no cross-run dedup collision on (to, template, related).
  const orgId = randomUUID();
  const propertyId = randomUUID();
  const vendorId = randomUUID();
  const woId = randomUUID();
  const orgSlug = `wired-test-${Date.now()}-${orgId.slice(0, 8)}`;

  console.log(`Recipient: ${recipient}`);
  console.log(`Work order id (dedup key): ${woId}\n`);

  // ----------------------------- fixture seed ------------------------------
  // Admin client bypasses RLS. Order matters only because of FK constraints.
  {
    const { error } = await admin
      .from("organizations")
      .insert({ id: orgId, name: "Wired Test Org", slug: orgSlug });
    if (error) {
      console.error(`fixture org insert failed: ${error.message}`);
      process.exit(2);
    }
  }
  {
    const { error } = await admin
      .from("vendors")
      .insert({
        id: vendorId,
        organization_id: orgId,
        name: "Wired Test Vendor",
        email: recipient,
      });
    if (error) {
      console.error(`fixture vendor insert failed: ${error.message}`);
      await admin.from("organizations").delete().eq("id", orgId);
      process.exit(2);
    }
  }
  {
    const { error } = await admin
      .from("properties")
      .insert({
        id: propertyId,
        organization_id: orgId,
        name: "Wired Test Property",
      });
    if (error) {
      console.error(`fixture property insert failed: ${error.message}`);
      await admin.from("organizations").delete().eq("id", orgId);
      process.exit(2);
    }
  }
  {
    const { error } = await admin.from("work_orders").insert({
      id: woId,
      organization_id: orgId,
      property_id: propertyId,
      title: "Loop-proof WO",
      assignee_type: "vendor",
      assigned_vendor_id: vendorId,
      status: "assigned",
    });
    if (error) {
      console.error(`fixture work_order insert failed: ${error.message}`);
      await admin.from("organizations").delete().eq("id", orgId);
      process.exit(2);
    }
  }

  try {
    // ----- Event 1: status assigned -> accepted -----
    await admin
      .from("work_orders")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", woId);

    const r1 = await notifyWorkOrderStatusChanged({
      organizationId: orgId,
      workOrderId: woId,
      recipientEmail: recipient,
      recipientName: "Test Recipient",
      workOrderTitle: "Loop-proof WO",
      workOrderNumber: null,
      newStatus: "Accepted",
      changedBy: "Test User",
    });
    console.log("Event 1 (status -> Accepted):");
    console.log(JSON.stringify(r1, null, 2));

    // ----- Event 2: rapid-succession status change on the SAME work order -----
    await admin
      .from("work_orders")
      .update({ status: "in_progress" })
      .eq("id", woId);

    const r2 = await notifyWorkOrderStatusChanged({
      organizationId: orgId,
      workOrderId: woId,
      recipientEmail: recipient,
      recipientName: "Test Recipient",
      workOrderTitle: "Loop-proof WO",
      workOrderNumber: null,
      newStatus: "In Progress",
      changedBy: "Test User",
    });
    console.log(
      "\nEvent 2 (same recipient + template + work_order_id; rapid succession):",
    );
    console.log(JSON.stringify(r2, null, 2));

    // ----- E1 assertions -----
    check("E1.a", "first notify reached Resend (status=sent)", r1?.status === "sent", r1);
    check("E1.b", "first notify delivered=true", r1?.delivered === true);
    check(
      "E1.c",
      "first notify reason mentions Resend message id",
      r1 != null && /Sent via Resend.*message id/i.test(r1.reason),
      r1?.reason,
    );

    // ----- E2 assertions — loop-proof -----
    check("E2.a", "second notify suppressed (status=suppressed)", r2?.status === "suppressed", r2);
    check("E2.b", "second notify delivered=false", r2?.delivered === false);
    check(
      "E2.c",
      "second notify reason indicates duplicate / equivalent",
      r2 != null && /equivalent|duplicate|already sent/i.test(r2.reason),
      r2?.reason,
    );

    // ----- email_log: structural verification of both events -----
    const pg = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await pg.connect();
    const { rows } = await pg.query(
      `select status, reason, payload, created_at, related_entity_type,
              related_entity_id, template, to_address
         from public.email_log
        where related_entity_id = $1 and template = $2
        order by created_at`,
      [woId, "work_order.status_changed"],
    );
    await pg.end();

    console.log(`\nemail_log rows for this WO (${rows.length}):`);
    console.log(JSON.stringify(rows, null, 2));

    check("LOG.count", "two email_log rows exist for the wired WO", rows.length === 2, rows.length);
    check("LOG.row1.status", "first row status=sent", rows[0]?.status === "sent", rows[0]?.status);
    check(
      "LOG.row1.payload",
      "first row payload has providerId (Resend message id)",
      typeof rows[0]?.payload?.providerId === "string",
      rows[0]?.payload,
    );
    check(
      "LOG.row2.status",
      "second row status=suppressed",
      rows[1]?.status === "suppressed",
      rows[1]?.status,
    );
    check(
      "LOG.scope",
      "both rows scoped to the same work_order_id",
      rows.every((r) => r.related_entity_id === woId),
    );
    check(
      "LOG.recipient",
      "both rows sent to the same recipient",
      rows.every((r) => r.to_address === recipient.toLowerCase() || r.to_address === recipient),
    );
  } finally {
    // Cleanup — cascade through the org delete. email_log rows for this test
    // cascade out too (email_log.organization_id ON DELETE CASCADE).
    await admin.from("organizations").delete().eq("id", orgId);
  }

  console.log(`\n${failed === 0 ? "PASSED" : "FAILED"} — ${failed} failures.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`Runner error: ${(e as Error).message}`);
  process.exit(2);
});

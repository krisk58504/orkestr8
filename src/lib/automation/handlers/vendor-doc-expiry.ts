import "server-only";
import { z } from "zod";
import { resolveVendorRecipient } from "@/lib/automation/recipients/vendor";
import type {
  AutomationAdminClient,
  AutomationHandler,
  HandlerResult,
  HandlerRunParams,
} from "@/lib/automation/types";
import { sendEmail } from "@/lib/email/send";
import {
  EMAIL_TEMPLATE,
  vendorDocExpiryEmail,
} from "@/lib/email/templates";

/**
 * Phase 7 slice 1 handler — vendor document expiry monitoring.
 *
 * For each vendor_document expiring in exactly `threshold_days_ahead`
 * days from today (where threshold ∈ config.thresholds_days), emails
 * the vendor's primary contact (or vendor.email fallback) a reminder.
 *
 * Per-pair idempotency: `vendor_doc_expiry:<vendor_document_id>:<threshold>`.
 * The UNIQUE(automation_id, idempotency_key) constraint on automation_runs
 * is the structural loop-prevention enforcement (D1 from
 * PHASE_6_AUDIT_DRAFT.md Section 2 §D).
 *
 * Edge cases enumerated in docs/PHASE_7_SLICE_1_AUDIT.md §3.5.
 *
 * NOTE: PHASE_7_PLAN.md §1.4 referenced `vendor_documents.expires_at`;
 * the actual column is `expires_on` (date). Audit §10.1 + decisions doc
 * §A.1 flag the plan-correction follow-up.
 */

const VendorDocExpiryConfigSchema = z.object({
  thresholds_days: z
    .array(z.number().int().positive())
    .min(1)
    .default([30, 14, 7]),
  template_id: z.string().default("vendor_doc_expiry_default"),
  notify_pm: z.boolean().default(false), // future-slice hook; not wired in slice 1
});

export type VendorDocExpiryConfig = z.infer<typeof VendorDocExpiryConfigSchema>;

async function run(
  admin: AutomationAdminClient,
  params: HandlerRunParams,
): Promise<HandlerResult> {
  const parsed = VendorDocExpiryConfigSchema.safeParse(params.config);
  if (!parsed.success) {
    await admin.from("automation_runs").insert({
      organization_id: params.organizationId,
      automation_id: params.automationId,
      status: "failed",
      idempotency_key: `vendor_doc_expiry:invalid_config:${new Date().toISOString().slice(0, 10)}`,
      ended_at: new Date().toISOString(),
      error_message: "invalid_config",
      result: { issues: parsed.error.issues } as never,
    });
    return { attempted: 0, succeeded: 0, skipped: 0, failed: 1 };
  }
  const config = parsed.data;

  // Compute target dates: for each threshold N, the date = today + N.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const targets = config.thresholds_days.map((days) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + days);
    return { days, dateString: d.toISOString().slice(0, 10) };
  });
  const targetDateStrings = targets.map((t) => t.dateString);

  // Pull all vendor_documents in the org that mature into any target date.
  const { data: docs, error: docsError } = await admin
    .from("vendor_documents")
    .select("id, vendor_id, document_type, name, expires_on, vendors!inner(name, email)")
    .eq("organization_id", params.organizationId)
    .in("expires_on", targetDateStrings);
  if (docsError) {
    return { attempted: 0, succeeded: 0, skipped: 0, failed: 1 };
  }

  let attempted = 0,
    succeeded = 0,
    skipped = 0,
    failed = 0;

  for (const doc of docs ?? []) {
    if (!doc.expires_on) {
      // Defensive — SQL WHERE excludes nulls but the column type allows null.
      continue;
    }
    const matchedTarget = targets.find((t) => t.dateString === doc.expires_on);
    if (!matchedTarget) continue;

    const idempotencyKey = `vendor_doc_expiry:${doc.id}:${matchedTarget.days}`;
    attempted++;

    // Reserve the run slot. UNIQUE constraint blocks duplicates atomically.
    const { data: run, error: insertError } = await admin
      .from("automation_runs")
      .insert({
        organization_id: params.organizationId,
        automation_id: params.automationId,
        status: "running",
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .single();
    if (insertError || !run) {
      // UNIQUE collision — this (document, threshold) pair already processed.
      skipped++;
      continue;
    }

    const vendor = Array.isArray(doc.vendors) ? doc.vendors[0] : doc.vendors;
    const vendorEmail = vendor?.email ?? null;
    const vendorName = vendor?.name ?? "Vendor";

    const recipient = await resolveVendorRecipient(
      admin,
      doc.vendor_id,
      vendorEmail,
    );

    if (!recipient) {
      await admin
        .from("automation_runs")
        .update({
          status: "skipped",
          ended_at: new Date().toISOString(),
          result: {
            reason: "no_recipient",
            vendor_id: doc.vendor_id,
            vendor_document_id: doc.id,
            threshold_days: matchedTarget.days,
          } as never,
        })
        .eq("id", run.id);
      skipped++;
      continue;
    }

    const content = vendorDocExpiryEmail({
      vendorName,
      documentName: doc.name,
      documentType: doc.document_type,
      expiresOn: doc.expires_on,
      daysUntilExpiry: matchedTarget.days,
    });

    const sendResult = await sendEmail({
      to: recipient.email,
      organizationId: params.organizationId,
      template: EMAIL_TEMPLATE.vendorDocExpiry,
      content,
      relatedEntityType: "vendor_document",
      relatedEntityId: doc.id,
      payload: {
        vendor_id: doc.vendor_id,
        threshold_days: matchedTarget.days,
        recipient_source: recipient.source,
      },
    });

    if (sendResult.delivered) {
      await admin
        .from("automation_runs")
        .update({
          status: "ok",
          ended_at: new Date().toISOString(),
          result: {
            vendor_id: doc.vendor_id,
            vendor_document_id: doc.id,
            threshold_days: matchedTarget.days,
            recipient_email: recipient.email,
            recipient_source: recipient.source,
            email_status: sendResult.status,
          } as never,
        })
        .eq("id", run.id);
      succeeded++;
    } else {
      await admin
        .from("automation_runs")
        .update({
          status: "failed",
          ended_at: new Date().toISOString(),
          error_message: sendResult.reason,
          result: {
            vendor_id: doc.vendor_id,
            vendor_document_id: doc.id,
            threshold_days: matchedTarget.days,
            email_status: sendResult.status,
          } as never,
        })
        .eq("id", run.id);
      failed++;
    }
  }

  return { attempted, succeeded, skipped, failed };
}

export const vendorDocExpiryHandler: AutomationHandler = {
  type: "vendor_doc_expiry",
  configSchema: VendorDocExpiryConfigSchema,
  run,
};

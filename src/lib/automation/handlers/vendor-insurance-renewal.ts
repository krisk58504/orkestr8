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
  vendorInsuranceRenewalEmail,
} from "@/lib/email/templates";

/**
 * Phase 7 slice 5 handler — vendor insurance certificate renewal
 * cascade. Scoped subset of slice 1's vendor_doc_expiry (#37):
 * scans `vendor_documents` filtered to `document_type='insurance'`
 * and emits a specialized renewal email per
 * docs/PHASE_7_SLICE_5_AUDIT.md §5.1.
 *
 * Threshold cascade defaults to [60, 30, 14, 7] days (longer first
 * warning than slice 1's [30, 14, 7] — insurer-issued cert chain has
 * 3-6 week lead time per audit §G.2). Each (doc, threshold) pair
 * fires at most once via UNIQUE(automation_id, idempotency_key) on
 * automation_runs — key shape `vendor_insurance_renewal:<doc>:<threshold>`.
 *
 * Per audit §G.6 / Phase 7 §0.4 #9: NO auto-enable. Operator
 * inserts an automations row per org that opts in.
 */

const VendorInsuranceRenewalConfigSchema = z.object({
  thresholds_days: z
    .array(z.number().int().positive())
    .min(1)
    .default([60, 30, 14, 7]),
  template_id: z.string().default("vendor_insurance_renewal_default"),
});

export type VendorInsuranceRenewalConfig = z.infer<
  typeof VendorInsuranceRenewalConfigSchema
>;

async function run(
  admin: AutomationAdminClient,
  params: HandlerRunParams,
): Promise<HandlerResult> {
  const parsed = VendorInsuranceRenewalConfigSchema.safeParse(params.config);
  if (!parsed.success) {
    await admin.from("automation_runs").insert({
      organization_id: params.organizationId,
      automation_id: params.automationId,
      status: "failed",
      idempotency_key: `vendor_insurance_renewal:invalid_config:${new Date().toISOString().slice(0, 10)}`,
      ended_at: new Date().toISOString(),
      error_message: "invalid_config",
      result: { issues: parsed.error.issues } as never,
    });
    return { attempted: 0, succeeded: 0, skipped: 0, failed: 1 };
  }
  const config = parsed.data;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const targets = config.thresholds_days.map((days) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + days);
    return { days, dateString: d.toISOString().slice(0, 10) };
  });
  const targetDateStrings = targets.map((t) => t.dateString);

  const { data: docs, error: docsError } = await admin
    .from("vendor_documents")
    .select(
      "id, vendor_id, name, expires_on, vendors!inner(name, email)",
    )
    .eq("organization_id", params.organizationId)
    .eq("document_type", "insurance")
    .in("expires_on", targetDateStrings);
  if (docsError) {
    return { attempted: 0, succeeded: 0, skipped: 0, failed: 1 };
  }

  let attempted = 0,
    succeeded = 0,
    skipped = 0,
    failed = 0;

  for (const doc of docs ?? []) {
    if (!doc.expires_on) continue;
    const matchedTarget = targets.find((t) => t.dateString === doc.expires_on);
    if (!matchedTarget) continue;

    const idempotencyKey = `vendor_insurance_renewal:${doc.id}:${matchedTarget.days}`;
    attempted++;

    const { data: automationRun, error: insertError } = await admin
      .from("automation_runs")
      .insert({
        organization_id: params.organizationId,
        automation_id: params.automationId,
        status: "running",
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .single();
    if (insertError || !automationRun) {
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
        .eq("id", automationRun.id);
      skipped++;
      continue;
    }

    const content = vendorInsuranceRenewalEmail({
      vendorName,
      documentName: doc.name,
      expiresOn: doc.expires_on,
      daysUntilExpiry: matchedTarget.days,
    });

    const sendResult = await sendEmail({
      to: recipient.email,
      organizationId: params.organizationId,
      template: EMAIL_TEMPLATE.vendorInsuranceRenewal,
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
        .eq("id", automationRun.id);
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
        .eq("id", automationRun.id);
      failed++;
    }
  }

  return { attempted, succeeded, skipped, failed };
}

export const vendorInsuranceRenewalHandler: AutomationHandler = {
  type: "vendor_insurance_renewal",
  configSchema: VendorInsuranceRenewalConfigSchema,
  run,
};

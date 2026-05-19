/**
 * email/notifications.ts — best-effort transactional notification dispatch.
 *
 * Each helper builds one of the Phase 2 templates and hands it to
 * sendEmail(). They are invoked from server actions inside try/catch — a
 * delivery failure here must NEVER roll back the underlying database write.
 *
 * sendEmail() runs all Gate 3 guards (dedup fail-closed, allowlist,
 * test-mode-only) before reaching Resend, and dedup keys on
 * (to_address, template, related_entity_id) — which is intentional
 * loop-proofing: two notifications about the SAME entity to the SAME
 * recipient via the SAME template within the dedup window collapse to one
 * delivery.
 *
 * Helpers return EmailSendResult (whatever sendEmail returned) or null
 * when there is no recipient to send to (skip — not a failure).
 */
import "server-only";
import { sendEmail } from "./send";
import {
  EMAIL_TEMPLATE,
  maintenanceRequestReceivedEmail,
  vendorInvoiceSubmittedEmail,
  workOrderAssignedEmail,
  workOrderStatusChangedEmail,
} from "./templates";
import type { EmailSendResult } from "./types";

export type NotifyResult = EmailSendResult | null;

/** Notify a vendor that a work order has been assigned to their company. */
export async function notifyWorkOrderAssigned(params: {
  organizationId: string;
  workOrderId: string;
  vendorEmail: string | null;
  vendorName: string;
  workOrderTitle: string;
  workOrderNumber: string | null;
  propertyName: string;
  priority: string;
  scheduledFor: string | null;
}): Promise<NotifyResult> {
  if (!params.vendorEmail) return null;
  return sendEmail({
    to: params.vendorEmail,
    organizationId: params.organizationId,
    template: EMAIL_TEMPLATE.workOrderAssigned,
    content: workOrderAssignedEmail({
      vendorName: params.vendorName,
      workOrderTitle: params.workOrderTitle,
      workOrderNumber: params.workOrderNumber,
      propertyName: params.propertyName,
      priority: params.priority,
      scheduledFor: params.scheduledFor,
    }),
    relatedEntityType: "work_order",
    relatedEntityId: params.workOrderId,
  });
}

/** Notify a stakeholder that a work order's status has changed. */
export async function notifyWorkOrderStatusChanged(params: {
  organizationId: string;
  workOrderId: string;
  recipientEmail: string | null;
  recipientName: string;
  workOrderTitle: string;
  workOrderNumber: string | null;
  newStatus: string;
  changedBy: string;
}): Promise<NotifyResult> {
  if (!params.recipientEmail) return null;
  return sendEmail({
    to: params.recipientEmail,
    organizationId: params.organizationId,
    template: EMAIL_TEMPLATE.workOrderStatusChanged,
    content: workOrderStatusChangedEmail({
      recipientName: params.recipientName,
      workOrderTitle: params.workOrderTitle,
      workOrderNumber: params.workOrderNumber,
      newStatus: params.newStatus,
      changedBy: params.changedBy,
    }),
    relatedEntityType: "work_order",
    relatedEntityId: params.workOrderId,
  });
}

/** Acknowledge a newly-logged maintenance request to its reporter. */
export async function notifyMaintenanceRequestReceived(params: {
  organizationId: string;
  requestId: string;
  reporterEmail: string | null;
  reporterName: string;
  requestTitle: string;
  propertyName: string;
  category: string;
  priority: string;
}): Promise<NotifyResult> {
  if (!params.reporterEmail) return null;
  return sendEmail({
    to: params.reporterEmail,
    organizationId: params.organizationId,
    template: EMAIL_TEMPLATE.maintenanceRequestReceived,
    content: maintenanceRequestReceivedEmail({
      reporterName: params.reporterName,
      requestTitle: params.requestTitle,
      propertyName: params.propertyName,
      category: params.category,
      priority: params.priority,
    }),
    relatedEntityType: "maintenance_request",
    relatedEntityId: params.requestId,
  });
}

/** Notify an org manager that a vendor has submitted an invoice. */
export async function notifyVendorInvoiceSubmitted(params: {
  organizationId: string;
  invoiceId: string;
  recipientEmail: string | null;
  recipientName: string;
  vendorName: string;
  invoiceNumber: string;
  amount: string;
  workOrderTitle: string | null;
}): Promise<NotifyResult> {
  if (!params.recipientEmail) return null;
  return sendEmail({
    to: params.recipientEmail,
    organizationId: params.organizationId,
    template: EMAIL_TEMPLATE.vendorInvoiceSubmitted,
    content: vendorInvoiceSubmittedEmail({
      recipientName: params.recipientName,
      vendorName: params.vendorName,
      invoiceNumber: params.invoiceNumber,
      amount: params.amount,
      workOrderTitle: params.workOrderTitle,
    }),
    relatedEntityType: "vendor_invoice",
    relatedEntityId: params.invoiceId,
  });
}

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
  tenantInviteEmail,
  tenantMessageReceivedEmail,
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

/**
 * Notify a tenant that there are new messages in their portal conversation.
 *
 * IMPORTANT — dedup keying: relatedEntityId is the TENANT id, not the message
 * id. That makes the (to, template, related_entity_id) dedup window collapse
 * any burst of staff messages within 10 minutes into a single email per
 * tenant per window. The template body is intentionally generic — no excerpt,
 * no per-message sender attribution — so one email reads correctly whether
 * one or many messages triggered it.
 */
export async function notifyTenantMessageReceived(params: {
  organizationId: string;
  tenantId: string;
  tenantEmail: string;
  tenantFirstName: string;
  orgName: string;
  conversationUrl: string;
}): Promise<NotifyResult> {
  return sendEmail({
    to: params.tenantEmail,
    organizationId: params.organizationId,
    template: EMAIL_TEMPLATE.tenantMessage,
    content: tenantMessageReceivedEmail({
      tenantFirstName: params.tenantFirstName,
      orgName: params.orgName,
      conversationUrl: params.conversationUrl,
    }),
    relatedEntityType: "tenant_conversation",
    relatedEntityId: params.tenantId,
  });
}

/** Invite a tenant to the portal — the recipient gets a link with a raw token. */
export async function notifyTenantInvited(params: {
  organizationId: string;
  inviteId: string;
  tenantEmail: string;
  tenantFirstName: string;
  orgName: string;
  propertyName: string | null;
  unitNumber: string | null;
  invitedByName: string;
  acceptUrl: string;
  expiresAt: string;
}): Promise<NotifyResult> {
  return sendEmail({
    to: params.tenantEmail,
    organizationId: params.organizationId,
    template: EMAIL_TEMPLATE.tenantInvite,
    content: tenantInviteEmail({
      tenantFirstName: params.tenantFirstName,
      orgName: params.orgName,
      propertyName: params.propertyName,
      unitNumber: params.unitNumber,
      invitedByName: params.invitedByName,
      acceptUrl: params.acceptUrl,
      expiresAt: params.expiresAt,
    }),
    relatedEntityType: "tenant_invite",
    relatedEntityId: params.inviteId,
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

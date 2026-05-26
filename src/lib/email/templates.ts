/**
 * email/templates.ts — transactional email templates (Phase 2).
 *
 * Each builder is a pure function: structured data in, rendered
 * { subject, html, text } out. No I/O, no send — building a template never
 * sends anything. Templates are wired to sendEmail() separately.
 */
import type { EmailContent } from "./types";

/** Stable template ids — also stored on email_log.template. */
export const EMAIL_TEMPLATE = {
  workOrderAssigned: "work_order.assigned",
  workOrderStatusChanged: "work_order.status_changed",
  maintenanceRequestReceived: "maintenance_request.received",
  vendorInvoiceSubmitted: "vendor_invoice.submitted",
  tenantInvite: "tenant.invite",
  tenantMessage: "tenant.message",
  vendorDocExpiry: "vendor_document.expiring",
} as const;

export type EmailTemplateId =
  (typeof EMAIL_TEMPLATE)[keyof typeof EMAIL_TEMPLATE];

const BRAND = "Orkestr8";

/** Wrap body content in a minimal, inline-styled HTML shell. */
function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:24px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:20px 28px;background:#18181b;color:#ffffff;font-size:16px;font-weight:bold;">${BRAND}</td></tr>
          <tr><td style="padding:28px;">
            <h1 style="margin:0 0 16px;font-size:18px;">${heading}</h1>
            ${bodyHtml}
          </td></tr>
          <tr><td style="padding:18px 28px;background:#fafafa;color:#71717a;font-size:12px;">
            This is an automated message from ${BRAND}. Please do not reply.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/** Render a simple key/value detail block as HTML. */
function detailsHtml(rows: [string, string][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;font-size:14px;">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:3px 16px 3px 0;color:#71717a;">${k}</td><td style="padding:3px 0;">${v}</td></tr>`,
      )
      .join("")}
  </table>`;
}

/** Render the same detail rows as plain text. */
function detailsText(rows: [string, string][]): string {
  return rows.map(([k, v]) => `  ${k}: ${v}`).join("\n");
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;">${text}</p>`;
}

// --- Work order assigned to a vendor --------------------------------------

export type WorkOrderAssignedData = {
  vendorName: string;
  workOrderTitle: string;
  workOrderNumber: string | null;
  propertyName: string;
  priority: string;
  scheduledFor: string | null;
};

export function workOrderAssignedEmail(
  data: WorkOrderAssignedData,
): EmailContent {
  const rows: [string, string][] = [
    ["Work order", data.workOrderNumber ?? data.workOrderTitle],
    ["Property", data.propertyName],
    ["Priority", data.priority],
    ["Scheduled", data.scheduledFor ?? "To be scheduled"],
  ];
  const subject = `New work order assigned: ${data.workOrderTitle}`;
  const html = layout(
    "You have a new work order",
    paragraph(`Hello ${data.vendorName}, a work order has been assigned to your company.`) +
      detailsHtml(rows) +
      paragraph("Sign in to the vendor portal to accept it and update its status."),
  );
  const text = `Hello ${data.vendorName},

A work order has been assigned to your company:

${detailsText(rows)}

Sign in to the vendor portal to accept it and update its status.`;
  return { subject, html, text };
}

// --- Work order status changed --------------------------------------------

export type WorkOrderStatusChangedData = {
  recipientName: string;
  workOrderTitle: string;
  workOrderNumber: string | null;
  newStatus: string;
  changedBy: string;
};

export function workOrderStatusChangedEmail(
  data: WorkOrderStatusChangedData,
): EmailContent {
  const rows: [string, string][] = [
    ["Work order", data.workOrderNumber ?? data.workOrderTitle],
    ["New status", data.newStatus],
    ["Updated by", data.changedBy],
  ];
  const subject = `Work order ${data.workOrderNumber ?? data.workOrderTitle} is now ${data.newStatus}`;
  const html = layout(
    "Work order status updated",
    paragraph(`Hello ${data.recipientName}, the status of a work order has changed.`) +
      detailsHtml(rows),
  );
  const text = `Hello ${data.recipientName},

The status of a work order has changed:

${detailsText(rows)}`;
  return { subject, html, text };
}

// --- Maintenance request received -----------------------------------------

export type MaintenanceRequestReceivedData = {
  reporterName: string;
  requestTitle: string;
  propertyName: string;
  category: string;
  priority: string;
};

export function maintenanceRequestReceivedEmail(
  data: MaintenanceRequestReceivedData,
): EmailContent {
  const rows: [string, string][] = [
    ["Request", data.requestTitle],
    ["Property", data.propertyName],
    ["Category", data.category],
    ["Priority", data.priority],
  ];
  const subject = `We received your maintenance request: ${data.requestTitle}`;
  const html = layout(
    "Maintenance request received",
    paragraph(`Hello ${data.reporterName}, your maintenance request has been logged and will be reviewed by the property team.`) +
      detailsHtml(rows),
  );
  const text = `Hello ${data.reporterName},

Your maintenance request has been logged and will be reviewed:

${detailsText(rows)}`;
  return { subject, html, text };
}

// --- Vendor invoice submitted ---------------------------------------------

export type VendorInvoiceSubmittedData = {
  recipientName: string;
  vendorName: string;
  invoiceNumber: string;
  amount: string;
  workOrderTitle: string | null;
};

export function vendorInvoiceSubmittedEmail(
  data: VendorInvoiceSubmittedData,
): EmailContent {
  const rows: [string, string][] = [
    ["Vendor", data.vendorName],
    ["Invoice", data.invoiceNumber],
    ["Amount", data.amount],
    ["Work order", data.workOrderTitle ?? "Not linked"],
  ];
  const subject = `Invoice ${data.invoiceNumber} submitted by ${data.vendorName}`;
  const html = layout(
    "New vendor invoice submitted",
    paragraph(`Hello ${data.recipientName}, a vendor has submitted an invoice for review.`) +
      detailsHtml(rows) +
      paragraph("Review and approve it from the vendor's record."),
  );
  const text = `Hello ${data.recipientName},

A vendor has submitted an invoice for review:

${detailsText(rows)}

Review and approve it from the vendor's record.`;
  return { subject, html, text };
}

// --- Tenant portal invite -------------------------------------------------

export type TenantInviteData = {
  tenantFirstName: string;
  orgName: string;
  propertyName: string | null;
  unitNumber: string | null;
  invitedByName: string;
  acceptUrl: string;
  /** ISO date — when the invite stops being valid. */
  expiresAt: string;
};

export function tenantInviteEmail(data: TenantInviteData): EmailContent {
  const rows: [string, string][] = [
    ["Property", data.propertyName ?? "—"],
  ];
  if (data.unitNumber) rows.push(["Unit", data.unitNumber]);
  rows.push(["Invited by", data.invitedByName]);
  rows.push(["Expires", data.expiresAt]);

  const subject = `You're invited to the ${data.orgName} tenant portal`;
  const cta = `<p style="margin:16px 0;">
    <a href="${data.acceptUrl}" style="display:inline-block;padding:10px 18px;background:#18181b;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold;">Accept invite</a>
  </p>`;
  const html = layout(
    "Tenant portal invite",
    paragraph(`Hello ${data.tenantFirstName}, ${data.invitedByName} at ${data.orgName} has invited you to your tenant portal.`) +
      paragraph("Use the link below to set up your account and start tracking your lease, maintenance requests, and messages.") +
      cta +
      detailsHtml(rows) +
      paragraph(`This invite expires on ${data.expiresAt}. If you weren't expecting this email, you can safely ignore it — no account will be created until you click the link.`),
  );
  const text = `Hello ${data.tenantFirstName},

${data.invitedByName} at ${data.orgName} has invited you to your tenant portal.

Accept your invite: ${data.acceptUrl}

${detailsText(rows)}

This invite expires on ${data.expiresAt}. If you weren't expecting this email, you can safely ignore it — no account will be created until you click the link.`;
  return { subject, html, text };
}

// --- Tenant message received ----------------------------------------------

/**
 * Generic notification — intentionally NOT message-specific. Because the
 * notifier dedups on (to, template, tenant_id) within a 10-minute window,
 * one email can represent one OR many messages. The body therefore omits
 * the message excerpt and sender attribution — it just tells the tenant
 * there's activity in their conversation.
 */
export type TenantMessageReceivedData = {
  tenantFirstName: string;
  orgName: string;
  conversationUrl: string;
};

export function tenantMessageReceivedEmail(
  data: TenantMessageReceivedData,
): EmailContent {
  const subject = `New message from ${data.orgName}`;
  const cta = `<p style="margin:16px 0;">
    <a href="${data.conversationUrl}" style="display:inline-block;padding:10px 18px;background:#18181b;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold;">Open your conversation</a>
  </p>`;
  const html = layout(
    "New messages in your portal",
    paragraph(`Hello ${data.tenantFirstName}, you have new messages from the team at ${data.orgName}.`) +
      cta +
      paragraph("Sign in to your tenant portal to read and reply."),
  );
  const text = `Hello ${data.tenantFirstName},

You have new messages from the team at ${data.orgName}.

Open your conversation: ${data.conversationUrl}

Sign in to your tenant portal to read and reply.`;
  return { subject, html, text };
}

// --- Vendor document expiry (Phase 7 slice 1) ------------------------------

export type VendorDocExpiryData = {
  vendorName: string;
  documentName: string;
  documentType: string;
  expiresOn: string;
  daysUntilExpiry: number;
};

export function vendorDocExpiryEmail(
  data: VendorDocExpiryData,
): EmailContent {
  const subject =
    data.daysUntilExpiry <= 7
      ? `Action needed: ${data.documentType} expires in ${data.daysUntilExpiry} days`
      : `Reminder: ${data.documentType} expires in ${data.daysUntilExpiry} days`;
  const rows: [string, string][] = [
    ["Vendor", data.vendorName],
    ["Document", data.documentName],
    ["Type", data.documentType],
    ["Expires on", data.expiresOn],
    ["Days remaining", String(data.daysUntilExpiry)],
  ];
  const urgency =
    data.daysUntilExpiry <= 7
      ? "Please upload the renewed document as soon as possible — expired documents may block new job assignments."
      : "Please plan to upload the renewed document before the expiration date to avoid any interruption.";
  const html = layout(
    "Document expiring soon",
    paragraph(`Hello ${data.vendorName}, one of your compliance documents is expiring soon.`) +
      detailsHtml(rows) +
      paragraph(urgency),
  );
  const text = `Hello ${data.vendorName},

One of your compliance documents is expiring soon.

${detailsText(rows)}

${urgency}`;
  return { subject, html, text };
}

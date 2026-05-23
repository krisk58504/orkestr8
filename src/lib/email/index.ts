/**
 * email — outbound transactional email structure (SPEC Gate 3).
 *
 * The send path is intentionally NOT wired. sendEmail() runs every safety
 * gate and logs the attempt, but no provider call is made. See send.ts and
 * EMAIL_SAFETY.md.
 */
export { getEmailMode, isRecipientAllowed } from "./config";
export { logEmailAttempt, checkRecentDuplicate } from "./log";
export { sendEmail } from "./send";
export {
  EMAIL_TEMPLATE,
  workOrderAssignedEmail,
  workOrderStatusChangedEmail,
  maintenanceRequestReceivedEmail,
  vendorInvoiceSubmittedEmail,
  tenantInviteEmail,
} from "./templates";
export type {
  EmailTemplateId,
  WorkOrderAssignedData,
  WorkOrderStatusChangedData,
  MaintenanceRequestReceivedData,
  VendorInvoiceSubmittedData,
  TenantInviteData,
} from "./templates";
export type {
  DuplicateCheck,
  EmailContent,
  EmailMode,
  EmailSendResult,
  EmailStatus,
  OutboundEmail,
} from "./types";

/**
 * email — outbound transactional email structure (SPEC Gate 3).
 *
 * The send path is intentionally NOT wired. sendEmail() runs every safety
 * gate and logs the attempt, but no provider call is made. See send.ts and
 * EMAIL_SAFETY.md.
 */
export { getEmailMode, isRecipientAllowed } from "./config";
export { logEmailAttempt, isDuplicateRecentSend } from "./log";
export { sendEmail } from "./send";
export {
  EMAIL_TEMPLATE,
  workOrderAssignedEmail,
  workOrderStatusChangedEmail,
  maintenanceRequestReceivedEmail,
  vendorInvoiceSubmittedEmail,
} from "./templates";
export type {
  EmailTemplateId,
  WorkOrderAssignedData,
  WorkOrderStatusChangedData,
  MaintenanceRequestReceivedData,
  VendorInvoiceSubmittedData,
} from "./templates";
export type {
  EmailContent,
  EmailMode,
  EmailSendResult,
  EmailStatus,
  OutboundEmail,
} from "./types";

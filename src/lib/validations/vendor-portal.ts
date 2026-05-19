/**
 * vendor-portal.ts — zod schemas for vendor-portal write actions.
 *
 * A vendor user may only place an invoice in `draft` or `submitted` status —
 * approval/payment are staff-only and enforced again in the server action.
 */
import { z } from "zod";
import { optionalDate, optionalDecimal, optionalId, optionalText } from "./shared";

/** Invoice statuses a vendor-portal user is allowed to set. */
export const VENDOR_PORTAL_INVOICE_STATUS_VALUES = [
  "draft",
  "submitted",
] as const;

export const vendorInvoiceInputSchema = z.object({
  invoice_number: optionalText(80),
  amount: optionalDecimal(),
  status: z.enum(VENDOR_PORTAL_INVOICE_STATUS_VALUES),
  work_order_id: optionalId,
  issued_on: optionalDate,
  due_on: optionalDate,
  notes: optionalText(2000),
});

export type VendorInvoiceInput = z.input<typeof vendorInvoiceInputSchema>;
export type VendorInvoiceParsed = z.output<typeof vendorInvoiceInputSchema>;

/** Document types a vendor may record (mirrors the DB enum). */
export const VENDOR_PORTAL_DOCUMENT_TYPE_VALUES = [
  "insurance",
  "license",
  "w9",
  "contract",
  "certification",
  "other",
] as const;

export const vendorPortalDocumentInputSchema = z.object({
  document_type: z.enum(VENDOR_PORTAL_DOCUMENT_TYPE_VALUES),
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(160, "Name is too long."),
  issued_on: optionalDate,
  expires_on: optionalDate,
  notes: optionalText(2000),
});

export type VendorPortalDocumentInput = z.input<
  typeof vendorPortalDocumentInputSchema
>;
export type VendorPortalDocumentParsed = z.output<
  typeof vendorPortalDocumentInputSchema
>;

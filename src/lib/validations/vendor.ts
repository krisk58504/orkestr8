import { z } from "zod";
import { optionalDate, optionalText } from "./shared";

export const VENDOR_STATUS_VALUES = [
  "pending",
  "active",
  "inactive",
  "suspended",
] as const;

export const VENDOR_DOCUMENT_TYPE_VALUES = [
  "insurance",
  "license",
  "w9",
  "contract",
  "certification",
  "other",
] as const;

export const vendorInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(120, "Name is too long."),
  trade: optionalText(120),
  status: z.enum(VENDOR_STATUS_VALUES),
  email: optionalText(200),
  phone: optionalText(40),
  website: optionalText(200),
  address_line1: optionalText(200),
  city: optionalText(100),
  state: optionalText(60),
  postal_code: optionalText(20),
  notes: optionalText(2000),
  is_active: z.boolean().default(true),
});

export type VendorInput = z.input<typeof vendorInputSchema>;
export type VendorParsed = z.output<typeof vendorInputSchema>;

export const vendorContactInputSchema = z.object({
  vendor_id: z.string().min(1, "A vendor is required."),
  first_name: z
    .string()
    .trim()
    .min(1, "First name is required.")
    .max(80, "First name is too long."),
  last_name: z
    .string()
    .trim()
    .min(1, "Last name is required.")
    .max(80, "Last name is too long."),
  email: optionalText(200),
  phone: optionalText(40),
  title: optionalText(120),
  is_primary: z.boolean().default(false),
});

export type VendorContactInput = z.input<typeof vendorContactInputSchema>;
export type VendorContactParsed = z.output<typeof vendorContactInputSchema>;

export const vendorDocumentInputSchema = z.object({
  vendor_id: z.string().min(1, "A vendor is required."),
  document_type: z.enum(VENDOR_DOCUMENT_TYPE_VALUES),
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(160, "Name is too long."),
  issued_on: optionalDate,
  expires_on: optionalDate,
  notes: optionalText(2000),
});

export type VendorDocumentInput = z.input<typeof vendorDocumentInputSchema>;
export type VendorDocumentParsed = z.output<typeof vendorDocumentInputSchema>;

export const vendorRatingInputSchema = z.object({
  vendor_id: z.string().min(1, "A vendor is required."),
  rating: z
    .number()
    .int("Rating must be a whole number.")
    .min(1, "Rating must be between 1 and 5.")
    .max(5, "Rating must be between 1 and 5."),
  review: optionalText(2000),
});

export type VendorRatingInput = z.input<typeof vendorRatingInputSchema>;
export type VendorRatingParsed = z.output<typeof vendorRatingInputSchema>;

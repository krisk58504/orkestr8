import { z } from "zod";
import { optionalDate, optionalId, optionalText } from "./shared";

export const TENANT_STATUS_VALUES = [
  "prospect",
  "applicant",
  "current",
  "notice",
  "past",
  "evicted",
] as const;

export const tenantInputSchema = z.object({
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
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length ? v : null))
    .refine(
      (v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
      "Enter a valid email.",
    ),
  phone: optionalText(40),
  status: z.enum(TENANT_STATUS_VALUES),
  property_id: optionalId,
  unit_id: optionalId,
  date_of_birth: optionalDate,
  emergency_contact_name: optionalText(120),
  emergency_contact_phone: optionalText(40),
  move_in_date: optionalDate,
  move_out_date: optionalDate,
  notes: optionalText(2000),
});

export type TenantInput = z.input<typeof tenantInputSchema>;
export type TenantParsed = z.output<typeof tenantInputSchema>;

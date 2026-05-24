import { z } from "zod";
import {
  optionalDate,
  optionalDecimal,
  optionalId,
  optionalInt,
  optionalText,
} from "./shared";

export const LEAD_STATUS_VALUES = [
  "new",
  "contacted",
  "qualified",
  "tour_scheduled",
  "applied",
  "converted",
  "disqualified",
  "lost",
] as const;

export const LEAD_SOURCE_VALUES = [
  "website",
  "referral",
  "walkin",
  "partner",
  "other",
] as const;

export const leadInputSchema = z.object({
  first_name: z
    .string()
    .trim()
    .min(1, "First name is required.")
    .max(100, "First name is too long."),
  last_name: z
    .string()
    .trim()
    .min(1, "Last name is required.")
    .max(100, "Last name is too long."),
  email: optionalText(200),
  phone: optionalText(50),
  status: z.enum(LEAD_STATUS_VALUES),
  source: z.enum(LEAD_SOURCE_VALUES),
  assigned_to: optionalId,
  desired_property_id: optionalId,
  desired_move_in: optionalDate,
  desired_bedrooms: optionalInt(20),
  desired_budget: optionalDecimal(),
  notes: optionalText(2000),
});

export type LeadInput = z.input<typeof leadInputSchema>;
export type LeadParsed = z.output<typeof leadInputSchema>;

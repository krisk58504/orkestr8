import { z } from "zod";
import { optionalInt, optionalText, optionalYear } from "./shared";

export const PROPERTY_TYPE_VALUES = [
  "apartment",
  "condo",
  "townhome",
  "single_family",
  "duplex",
  "mixed_use",
  "commercial",
  "other",
] as const;

export const propertyInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(120, "Name is too long."),
  property_type: z.enum(PROPERTY_TYPE_VALUES),
  address_line1: optionalText(200),
  address_line2: optionalText(200),
  city: optionalText(100),
  state: optionalText(60),
  postal_code: optionalText(20),
  country: z.string().trim().min(1).max(60).default("US"),
  year_built: optionalYear,
  planned_units: optionalInt(100_000),
  description: optionalText(2000),
  is_active: z.boolean().default(true),
});

export type PropertyInput = z.input<typeof propertyInputSchema>;
export type PropertyParsed = z.output<typeof propertyInputSchema>;

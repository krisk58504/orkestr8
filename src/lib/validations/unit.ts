import { z } from "zod";
import { optionalDecimal, optionalId, optionalInt } from "./shared";

export const UNIT_STATUS_VALUES = [
  "vacant",
  "occupied",
  "notice",
  "make_ready",
  "off_market",
  "model",
  "down",
] as const;

export const unitInputSchema = z.object({
  property_id: z.string().min(1, "Select a property."),
  building_id: optionalId,
  unit_number: z
    .string()
    .trim()
    .min(1, "Unit number is required.")
    .max(30, "Unit number is too long."),
  status: z.enum(UNIT_STATUS_VALUES).default("vacant"),
  floor: optionalInt(1000),
  bedrooms: optionalDecimal(100),
  bathrooms: optionalDecimal(100),
  square_feet: optionalInt(1_000_000),
  market_rent: optionalDecimal(100_000_000),
  is_active: z.boolean().default(true),
});

export type UnitInput = z.input<typeof unitInputSchema>;
export type UnitParsed = z.output<typeof unitInputSchema>;

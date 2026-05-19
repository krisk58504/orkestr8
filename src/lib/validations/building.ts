import { z } from "zod";
import { optionalInt, optionalText, optionalYear } from "./shared";

export const BUILDING_STATUS_VALUES = [
  "active",
  "inactive",
  "under_construction",
] as const;

export const buildingInputSchema = z.object({
  property_id: z.string().min(1, "Select a property."),
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(120, "Name is too long."),
  status: z.enum(BUILDING_STATUS_VALUES).default("active"),
  floors: optionalInt(1000),
  year_built: optionalYear,
  address_line1: optionalText(200),
  notes: optionalText(2000),
});

export type BuildingInput = z.input<typeof buildingInputSchema>;
export type BuildingParsed = z.output<typeof buildingInputSchema>;

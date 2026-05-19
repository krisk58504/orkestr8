import { z } from "zod";
import { optionalId, optionalText } from "./shared";

export const MAINTENANCE_CATEGORY_VALUES = [
  "plumbing",
  "electrical",
  "hvac",
  "appliance",
  "structural",
  "pest",
  "landscaping",
  "locks",
  "general",
  "other",
] as const;

export const MAINTENANCE_PRIORITY_VALUES = [
  "low",
  "medium",
  "high",
  "emergency",
] as const;

export const MAINTENANCE_STATUS_VALUES = [
  "submitted",
  "triaged",
  "scheduled",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
] as const;

export const maintenanceRequestInputSchema = z.object({
  property_id: z.string().min(1, "Select a property."),
  unit_id: optionalId,
  tenant_id: optionalId,
  title: z
    .string()
    .trim()
    .min(2, "Title must be at least 2 characters.")
    .max(160, "Title is too long."),
  description: optionalText(2000),
  category: z.enum(MAINTENANCE_CATEGORY_VALUES),
  priority: z.enum(MAINTENANCE_PRIORITY_VALUES),
  status: z.enum(MAINTENANCE_STATUS_VALUES),
  location_notes: optionalText(200),
  access_instructions: optionalText(2000),
  permission_to_enter: z.boolean().default(false),
});

export type MaintenanceRequestInput = z.input<
  typeof maintenanceRequestInputSchema
>;
export type MaintenanceRequestParsed = z.output<
  typeof maintenanceRequestInputSchema
>;

import { z } from "zod";
import {
  optionalDateTime,
  optionalDecimal,
  optionalId,
  optionalText,
} from "./shared";

export const WORK_ORDER_STATUS_VALUES = [
  "open",
  "assigned",
  "accepted",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
] as const;

export const WORK_ORDER_ASSIGNEE_VALUES = [
  "unassigned",
  "internal",
  "vendor",
] as const;

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

export const workOrderInputSchema = z.object({
  property_id: z.string().min(1, "Select a property."),
  unit_id: optionalId,
  maintenance_request_id: optionalId,
  title: z
    .string()
    .trim()
    .min(2, "Title must be at least 2 characters.")
    .max(160, "Title is too long."),
  description: optionalText(2000),
  category: z.enum(MAINTENANCE_CATEGORY_VALUES),
  priority: z.enum(MAINTENANCE_PRIORITY_VALUES),
  status: z.enum(WORK_ORDER_STATUS_VALUES),
  assignee_type: z.enum(WORK_ORDER_ASSIGNEE_VALUES),
  assigned_vendor_id: optionalId,
  assigned_user_id: optionalId,
  scheduled_for: optionalDateTime,
  sla_due_at: optionalDateTime,
  cost_estimate: optionalDecimal(),
  cost_actual: optionalDecimal(),
  notes: optionalText(2000),
});

export type WorkOrderInput = z.input<typeof workOrderInputSchema>;
export type WorkOrderParsed = z.output<typeof workOrderInputSchema>;

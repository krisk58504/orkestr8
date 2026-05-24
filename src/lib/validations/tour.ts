import { z } from "zod";
import {
  optionalId,
  optionalText,
  requiredDateTime,
  requiredId,
} from "./shared";

export const TOUR_STATUS_VALUES = [
  "scheduled",
  "completed",
  "no_show",
  "cancelled",
] as const;

export const tourInputSchema = z.object({
  lead_id: requiredId("a lead"),
  unit_id: optionalId,
  agent_id: optionalId,
  scheduled_at: requiredDateTime,
  status: z.enum(TOUR_STATUS_VALUES),
  outcome_notes: optionalText(2000),
});

export type TourInput = z.input<typeof tourInputSchema>;
export type TourParsed = z.output<typeof tourInputSchema>;

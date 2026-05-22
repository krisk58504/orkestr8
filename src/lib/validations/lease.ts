import { z } from "zod";
import {
  optionalDate,
  optionalText,
  requiredDate,
  requiredDecimal,
  requiredId,
} from "./shared";

export const LEASE_STATUS_VALUES = ["upcoming", "active", "ended"] as const;

export const leaseInputSchema = z
  .object({
    unit_id: requiredId("a unit"),
    start_date: requiredDate,
    end_date: optionalDate,
    monthly_rent: requiredDecimal(),
    status: z.enum(LEASE_STATUS_VALUES),
    notes: optionalText(2000),
    tenant_ids: z.array(requiredId("a tenant")).default([]),
  })
  .refine((v) => v.end_date === null || v.end_date >= v.start_date, {
    message: "End date must be on or after the start date.",
    path: ["end_date"],
  });

export type LeaseInput = z.input<typeof leaseInputSchema>;
export type LeaseParsed = z.output<typeof leaseInputSchema>;

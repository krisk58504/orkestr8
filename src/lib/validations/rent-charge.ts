import { z } from "zod";
import {
  optionalDate,
  optionalText,
  requiredDate,
  requiredDecimal,
  requiredId,
} from "./shared";

export const RENT_CHARGE_TYPE_VALUES = [
  "rent",
  "deposit",
  "fee",
  "credit",
  "other",
] as const;

/**
 * rent_charges input — covers create and edit. Status is intentionally
 * NOT in the schema: lifecycle is managed by the recordPayment action
 * (slice 10b: open → partial/paid) and voidRentCharge (open/partial/paid →
 * voided). No client-driven status writes.
 */
export const rentChargeInputSchema = z
  .object({
    lease_id: requiredId("a lease"),
    tenant_id: requiredId("a tenant"),
    unit_id: requiredId("a unit"),
    charge_type: z.enum(RENT_CHARGE_TYPE_VALUES),
    amount_due: requiredDecimal(),
    due_date: requiredDate,
    period_start: optionalDate,
    period_end: optionalDate,
    description: optionalText(200),
    notes: optionalText(2000),
  })
  .refine(
    (v) =>
      v.period_start === null ||
      v.period_end === null ||
      v.period_end >= v.period_start,
    { message: "Period end must be on or after period start.", path: ["period_end"] },
  );

export type RentChargeInput = z.input<typeof rentChargeInputSchema>;
export type RentChargeParsed = z.output<typeof rentChargeInputSchema>;

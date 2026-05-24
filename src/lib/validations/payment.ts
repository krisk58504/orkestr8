import { z } from "zod";
import {
  optionalText,
  requiredDateTime,
  requiredDecimal,
  requiredId,
} from "./shared";

export const PAYMENT_METHOD_VALUES = [
  "cash",
  "check",
  "ach",
  "wire",
  "money_order",
  "zelle",
  "card_offline",
  "other",
] as const;

/**
 * payments input — covers create and edit. Refund fields are deliberately
 * NOT in the schema: refundPayment is deferred to a future slice. The
 * refunded_at / refunded_by / refund_reason columns exist on the table
 * (forward-compat) but no slice 10b action writes them.
 *
 * tenant_id is required at the input layer for explicitness, but the
 * server action validates that it matches the charge's tenant_id —
 * the charge is the source of truth.
 */
export const paymentInputSchema = z.object({
  charge_id: requiredId("a rent charge"),
  tenant_id: requiredId("a tenant"),
  amount_paid: requiredDecimal(),
  paid_at: requiredDateTime,
  method: z.enum(PAYMENT_METHOD_VALUES),
  reference: optionalText(200),
  notes: optionalText(2000),
});

export type PaymentInput = z.input<typeof paymentInputSchema>;
export type PaymentParsed = z.output<typeof paymentInputSchema>;

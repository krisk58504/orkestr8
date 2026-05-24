import { z } from "zod";
import type { ApplicationStatus } from "@/lib/types/app";
import {
  optionalDate,
  optionalDecimal,
  optionalId,
  optionalText,
  requiredId,
} from "./shared";

export const APPLICATION_STATUS_VALUES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "withdrawn",
] as const;

/**
 * Status transition rules — enforced in the server action layer per
 * PHASE_4_PLAN.md §7 risk 4 (RLS does NOT carry a RESTRICTIVE policy
 * for these; status discipline lives in the application layer).
 *
 *   draft        → submitted, withdrawn
 *   submitted    → under_review, withdrawn, rejected
 *   under_review → approved, rejected, withdrawn
 *   approved     → withdrawn    (rare — captures approved-then-fell-through)
 *   rejected     → (terminal)
 *   withdrawn    → (terminal)
 *
 * Self-transitions (no-op edits where status doesn't change) are admitted
 * by the helper because `from === to` short-circuits to true.
 */
export const APPLICATION_STATUS_TRANSITIONS: Record<
  ApplicationStatus,
  ApplicationStatus[]
> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["under_review", "withdrawn", "rejected"],
  under_review: ["approved", "rejected", "withdrawn"],
  approved: ["withdrawn"],
  rejected: [],
  withdrawn: [],
};

/** True iff the proposed transition is allowed (or is a no-op). */
export function isAllowedTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  if (from === to) return true;
  return APPLICATION_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * The form's input shape. Decision fields (decided_at / decided_by /
 * decision_notes) are NOT in this schema — those are set exclusively by
 * the approve / reject server actions, not by the general edit form.
 */
export const applicationInputSchema = z.object({
  lead_id: optionalId,
  unit_id: requiredId("a unit"),
  status: z.enum(APPLICATION_STATUS_VALUES),
  applicant_first_name: z
    .string()
    .trim()
    .min(1, "First name is required.")
    .max(100, "First name is too long."),
  applicant_last_name: z
    .string()
    .trim()
    .min(1, "Last name is required.")
    .max(100, "Last name is too long."),
  applicant_email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .max(200, "Email is too long.")
    .email("Enter a valid email address."),
  applicant_phone: optionalText(50),
  desired_move_in: optionalDate,
  monthly_income: optionalDecimal(),
  employment_status: optionalText(100),
  prior_address: optionalText(500),
  background_check_consent: z.boolean().default(false),
});

export type ApplicationInput = z.input<typeof applicationInputSchema>;
export type ApplicationParsed = z.output<typeof applicationInputSchema>;

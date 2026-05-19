/**
 * shared.ts — reusable zod field builders for entity forms.
 *
 * Form inputs arrive as strings; these builders trim, convert empty strings to
 * null, and coerce/validate numbers — producing clean values for the database.
 */
import { z } from "zod";

/** Optional free text — "" becomes null. */
export function optionalText(max = 200) {
  return z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));
}

/** Optional 4-digit year, validated to a sensible range. */
export const optionalYear = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || /^\d{4}$/.test(v), "Enter a valid 4-digit year.")
  .transform((v) => (v === null ? null : Number(v)))
  .refine(
    (v) => v === null || (v >= 1700 && v <= 2100),
    "Year must be between 1700 and 2100.",
  );

/** Optional non-negative whole number. */
export function optionalInt(max = 1_000_000) {
  return z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= max),
      "Enter a whole number.",
    );
}

/** Optional non-negative decimal number. */
export function optionalDecimal(max = 100_000_000) {
  return z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 0 && v <= max),
      "Enter a valid amount.",
    );
}

/** Optional ID reference — "" / "none" become null. */
export const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 && v !== "none" ? v : null));

/** Optional ISO date string — "" becomes null. */
export const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine(
    (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
    "Enter a valid date.",
  );

/** Collapse a ZodError into the first message per top-level field. */
export function collectFieldErrors(
  error: z.ZodError,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) {
      out[key] = issue.message;
    }
  }
  return out;
}

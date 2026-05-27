/**
 * periods.ts — shared monthly-period helper for rent charge generation.
 *
 * Originally inlined in `src/app/(app)/payments/bulk-actions.ts` (Phase 5
 * slice 10a). Extracted in Phase 7 slice 3 so the cron-triggered
 * `rent_charge_generation` handler and the button-triggered
 * `generateChargesForProperty` action consume the same period-computation
 * code path.
 *
 * **Bit-identical requirement** (per docs/PHASE_7_SLICE_3_AUDIT.md §3.2 +
 * Addition A): the function body MUST match the original inline
 * implementation byte-for-byte. No timezone changes, no date-fns adoption,
 * no clean-up refactor. Drift is a regression risk — walk-test scenario
 * §8.7 verifies the button-triggered path produces identical output
 * before vs after the extraction.
 *
 * No I/O. Safe on server or client (though typical consumers are
 * server-side).
 */

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function periodForMonth(year: number, month: number): {
  period_start: string;
  period_end: string;
  due_date: string;
  description: string;
} {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    period_start: iso(first),
    period_end: iso(last),
    due_date: iso(first),
    description: `${MONTH_NAMES[month - 1]} ${year} rent`,
  };
}

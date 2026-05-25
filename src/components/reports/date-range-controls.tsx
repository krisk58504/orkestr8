"use client";

import { useRouter } from "next/navigation";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/payments/statements/date-range-picker";

/**
 * URL-param-driven wrapper over DateRangePicker. Distinct from slice 10d's
 * inline-form-state usage (statement picker) — reports use this to set
 * ?from=&to= on the page URL so the report re-fetches with new date range.
 */
export function DateRangeControls({
  basePath,
  current,
}: {
  basePath: string;
  current: DateRange;
}) {
  const router = useRouter();

  function handleChange(next: DateRange) {
    const params = new URLSearchParams({ from: next.from, to: next.to });
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="print:hidden">
      <DateRangePicker value={current} onChange={handleChange} />
    </div>
  );
}

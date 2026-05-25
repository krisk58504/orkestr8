import Link from "next/link";
import { ArrowLeft, Star, Truck } from "lucide-react";
import { PrintButton } from "@/components/payments/statements/print-button";
import { DateRangeControls } from "@/components/reports/date-range-controls";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VENDOR_STATUS_META } from "@/lib/constants";
import type { VendorPerformanceRow } from "@/lib/data/reports/vendor-performance";

function formatHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 24) return `${Math.round(h)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function formatRating(r: number | null, count: number): string {
  if (r === null || count === 0) return "—";
  return `${r.toFixed(1)} (${count})`;
}

export function VendorPerformanceReport({
  rows,
  period,
}: {
  rows: VendorPerformanceRow[];
  period: { from: string; to: string };
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          render={<Link href="/reports" />}
        >
          <ArrowLeft className="size-4" />
          Reports
        </Button>
        <PrintButton />
      </div>

      <PageHeader
        title="Vendor performance"
        description="Per-vendor work orders, resolution time, and ratings."
      />

      <DateRangeControls
        basePath="/reports/vendor-performance"
        current={period}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No vendors yet"
          description="Add vendors to see performance metrics."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>By vendor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 text-left font-medium">Vendor</th>
                    <th className="py-2 text-left font-medium">Status</th>
                    <th className="py-2 text-right font-medium">
                      Assigned (period)
                    </th>
                    <th className="py-2 text-right font-medium">Completed</th>
                    <th className="py-2 text-right font-medium">Open now</th>
                    <th className="py-2 text-right font-medium">
                      Avg resolution
                    </th>
                    <th className="py-2 text-right font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Star className="size-3.5" />
                        Rating
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.vendor_id}
                      className="border-b last:border-b-0"
                    >
                      <td className="py-2 font-medium">{r.vendor_name}</td>
                      <td className="py-2">
                        <StatusBadge
                          tone={VENDOR_STATUS_META[r.vendor_status].tone}
                        >
                          {VENDOR_STATUS_META[r.vendor_status].label}
                        </StatusBadge>
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {r.total_assigned_in_period}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {r.completed_in_period}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {r.open_now}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatHours(r.avg_resolution_hours)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatRating(r.avg_rating, r.rating_count)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

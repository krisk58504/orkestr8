import Link from "next/link";
import { ArrowLeft, Building2, DoorOpen } from "lucide-react";
import { PrintButton } from "@/components/payments/statements/print-button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OccupancyBarChart } from "@/components/reports/occupancy-bar-chart";
import type { OccupancyRow } from "@/lib/data/reports/occupancy";

export function OccupancyReport({
  rows,
  backHref = "/reports",
}: {
  rows: OccupancyRow[];
  backHref?: string;
}) {
  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total_units,
      occupied: acc.occupied + r.occupied,
      vacant: acc.vacant + r.vacant,
      other: acc.other + r.other,
    }),
    { total: 0, occupied: 0, vacant: 0, other: 0 },
  );
  const orgOccupancyPct =
    totals.total > 0 ? Math.round((totals.occupied / totals.total) * 100) : 0;

  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 print:hidden"
          render={<Link href={backHref} />}
        >
          <ArrowLeft className="size-4" />
          Reports
        </Button>
        <PageHeader title="Occupancy" />
        <EmptyState
          icon={Building2}
          title="No properties yet"
          description="Add a property and units to see occupancy metrics."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          render={<Link href={backHref} />}
        >
          <ArrowLeft className="size-4" />
          Reports
        </Button>
        <PrintButton />
      </div>

      <PageHeader
        title="Occupancy"
        description="Unit occupancy across your portfolio."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          label="Occupancy"
          value={`${orgOccupancyPct}%`}
          icon={Building2}
          hint={`${totals.occupied} of ${totals.total}`}
        />
        <StatCard label="Total units" value={totals.total} icon={DoorOpen} />
        <StatCard label="Occupied" value={totals.occupied} icon={DoorOpen} />
        <StatCard label="Vacant" value={totals.vacant} icon={DoorOpen} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Occupancy by property</CardTitle>
        </CardHeader>
        <CardContent>
          <OccupancyBarChart
            data={rows.map((r) => ({
              name: r.property_name,
              pct: Math.round(r.occupancy_pct),
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 text-left font-medium">Property</th>
                <th className="py-2 text-right font-medium">Total</th>
                <th className="py-2 text-right font-medium">Occupied</th>
                <th className="py-2 text-right font-medium">Vacant</th>
                <th className="py-2 text-right font-medium">Other</th>
                <th className="py-2 text-right font-medium">Occupancy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.property_id} className="border-b last:border-b-0">
                  <td className="py-2">
                    <div className="font-medium">{r.property_name}</div>
                    {r.city ? (
                      <div className="text-xs text-muted-foreground">
                        {r.city}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {r.total_units}
                  </td>
                  <td className="py-2 text-right tabular-nums">{r.occupied}</td>
                  <td className="py-2 text-right tabular-nums">{r.vacant}</td>
                  <td className="py-2 text-right tabular-nums">{r.other}</td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {Math.round(r.occupancy_pct)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

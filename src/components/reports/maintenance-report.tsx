import Link from "next/link";
import { ArrowLeft, Clock, ClipboardList, Wrench } from "lucide-react";
import { PrintButton } from "@/components/payments/statements/print-button";
import { DateRangeControls } from "@/components/reports/date-range-controls";
import { MaintenanceCharts } from "@/components/reports/maintenance-charts";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MaintenanceReport as MaintenanceReportData } from "@/lib/data/reports/maintenance";

function formatHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 24) return `${Math.round(h)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export function MaintenanceReport({ report }: { report: MaintenanceReportData }) {
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
        title="Maintenance"
        description="Request volume and work-order completion metrics."
      />

      <DateRangeControls
        basePath="/reports/maintenance"
        current={report.period}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          label="Requests in period"
          value={report.requests_created_in_period}
          icon={ClipboardList}
        />
        <StatCard
          label="Open today"
          value={report.open_requests_today}
          icon={ClipboardList}
        />
        <StatCard
          label="WOs completed"
          value={report.work_orders_completed_in_period}
          icon={Wrench}
          hint="in period"
        />
        <StatCard
          label="Avg resolution"
          value={formatHours(report.avg_resolution_hours)}
          icon={Clock}
        />
      </div>

      <MaintenanceCharts
        requestsByPriority={report.requests_by_priority}
        workOrdersByStatus={report.work_orders_by_status}
      />

      <Card>
        <CardHeader>
          <CardTitle>By property</CardTitle>
        </CardHeader>
        <CardContent>
          {report.per_property.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No properties yet.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 text-left font-medium">Property</th>
                  <th className="py-2 text-right font-medium">
                    Requests (period)
                  </th>
                  <th className="py-2 text-right font-medium">WOs completed</th>
                  <th className="py-2 text-right font-medium">WOs open</th>
                </tr>
              </thead>
              <tbody>
                {report.per_property.map((p) => (
                  <tr key={p.property_id} className="border-b last:border-b-0">
                    <td className="py-2 font-medium">{p.property_name}</td>
                    <td className="py-2 text-right tabular-nums">
                      {p.requests_in_period}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {p.work_orders_completed}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {p.work_orders_open}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

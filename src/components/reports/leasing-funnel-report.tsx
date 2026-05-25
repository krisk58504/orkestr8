import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { PrintButton } from "@/components/payments/statements/print-button";
import { DateRangeControls } from "@/components/reports/date-range-controls";
import { LeasingFunnelCharts } from "@/components/reports/leasing-funnel-charts";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import type { LeasingFunnelReport as LeasingFunnelReportData } from "@/lib/data/reports/leasing-funnel";

function formatPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

export function LeasingFunnelReport({
  report,
}: {
  report: LeasingFunnelReportData;
}) {
  const stages = [
    {
      label: "Leads",
      value: report.leads_in_period,
      icon: UserPlus,
      rate: null as string | null,
    },
    {
      label: "Tours",
      value: report.tours_in_period,
      icon: ClipboardCheck,
      rate: formatPct(report.conversion_rates.lead_to_tour),
    },
    {
      label: "Applications",
      value: report.applications_in_period,
      icon: ClipboardCheck,
      rate: formatPct(report.conversion_rates.tour_to_application),
    },
    {
      label: "Approved",
      value: report.approved_applications_in_period,
      icon: CheckCircle2,
      rate: formatPct(report.conversion_rates.application_to_approved),
    },
    {
      label: "Conversions",
      value: report.conversions_in_period,
      icon: Users,
      rate: formatPct(report.conversion_rates.approved_to_conversion),
    },
  ];

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
        title="Leasing funnel"
        description="Leads through conversions for the selected period."
      />

      <DateRangeControls
        basePath="/reports/leasing-funnel"
        current={report.period}
      />

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stages.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            icon={s.icon}
            hint={s.rate ? `${s.rate} from previous` : undefined}
          />
        ))}
      </div>

      <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <TrendingUp className="size-4 text-muted-foreground" />
          Lead → conversion: {formatPct(report.conversion_rates.lead_to_conversion)}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          End-to-end conversion rate over the selected period.
        </p>
      </div>

      <LeasingFunnelCharts
        leadsBySource={report.leads_by_source}
        applicationsByStatus={report.applications_by_status}
      />
    </div>
  );
}

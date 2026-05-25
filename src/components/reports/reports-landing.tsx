import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ClipboardList,
  DollarSign,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatPct(p: number): string {
  return `${Math.round(p)}%`;
}

function formatAmount(amount: number): string {
  return `$${Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type ReportTile = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  metric: string;
  metricLabel: string;
};

export function ReportsLanding({
  occupancy,
  rentRoll,
  maintenance,
  vendor,
  funnel,
}: {
  occupancy: { occupancy_pct: number; total_units: number } | null;
  rentRoll: { total_past_due: number; delinquent_tenant_count: number };
  maintenance: { open_requests: number };
  vendor: { active_vendor_count: number };
  funnel: { leads_in_period: number };
}) {
  const tiles: ReportTile[] = [
    {
      href: "/reports/occupancy",
      icon: Building2,
      title: "Occupancy",
      description: "Unit occupancy by property with vacancy breakdown.",
      metric: occupancy ? formatPct(occupancy.occupancy_pct) : "—",
      metricLabel: occupancy
        ? `${occupancy.total_units} units`
        : "no data yet",
    },
    {
      href: "/reports/rent-roll",
      icon: DollarSign,
      title: "Rent roll",
      description: "Tenant balances and 30/60/90+ delinquency aging.",
      metric: formatAmount(rentRoll.total_past_due),
      metricLabel: `${rentRoll.delinquent_tenant_count} delinquent`,
    },
    {
      href: "/reports/maintenance",
      icon: ClipboardList,
      title: "Maintenance",
      description: "Request volume and work-order completion metrics.",
      metric: String(maintenance.open_requests),
      metricLabel: "open requests today",
    },
    {
      href: "/reports/vendor-performance",
      icon: Truck,
      title: "Vendor performance",
      description: "Per-vendor work orders, resolution time, ratings.",
      metric: String(vendor.active_vendor_count),
      metricLabel: "active vendors",
    },
    {
      href: "/reports/leasing-funnel",
      icon: TrendingUp,
      title: "Leasing funnel",
      description: "Leads → tours → applications → conversions.",
      metric: String(funnel.leads_in_period),
      metricLabel: "leads (last 30 days)",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <Link
            key={tile.href}
            href={tile.href}
            className="group block focus:outline-none"
          >
            <Card className="h-full transition-colors group-hover:border-foreground/20">
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="size-4 text-muted-foreground" />
                    {tile.title}
                  </CardTitle>
                  <CardDescription>{tile.description}</CardDescription>
                </div>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tabular-nums">
                  {tile.metric}
                </div>
                <p className="text-xs text-muted-foreground">
                  {tile.metricLabel}
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft, DollarSign } from "lucide-react";
import { PrintButton } from "@/components/payments/statements/print-button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LEASE_STATUS_META } from "@/lib/constants";
import type { RentRollRow } from "@/lib/data/reports/rent-roll";

function formatAmount(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function RentRollReport({
  rows,
  backHref = "/reports",
}: {
  rows: RentRollRow[];
  backHref?: string;
}) {
  const totals = rows.reduce(
    (acc, r) => ({
      current: acc.current + r.current,
      days_30: acc.days_30 + r.days_30,
      days_60: acc.days_60 + r.days_60,
      days_90_plus: acc.days_90_plus + r.days_90_plus,
      total_past_due: acc.total_past_due + r.total_past_due,
    }),
    { current: 0, days_30: 0, days_60: 0, days_90_plus: 0, total_past_due: 0 },
  );
  const delinquent = rows.filter((r) => r.total_past_due > 0).length;

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
        <PageHeader title="Rent roll" />
        <EmptyState
          icon={DollarSign}
          title="No tenants yet"
          description="Add tenants and leases to see the rent roll."
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
        title="Rent roll"
        description="Per-tenant balances and 30/60/90+ delinquency aging."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          label="Total past-due"
          value={formatAmount(totals.total_past_due)}
          icon={DollarSign}
          hint={`${delinquent} delinquent`}
        />
        <StatCard label="30 days" value={formatAmount(totals.days_30)} icon={DollarSign} />
        <StatCard label="60 days" value={formatAmount(totals.days_60)} icon={DollarSign} />
        <StatCard label="90+ days" value={formatAmount(totals.days_90_plus)} icon={DollarSign} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By tenant</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 text-left font-medium">Tenant</th>
                  <th className="py-2 text-left font-medium">Property / Unit</th>
                  <th className="py-2 text-left font-medium">Lease</th>
                  <th className="py-2 text-right font-medium">Rent</th>
                  <th className="py-2 text-right font-medium">Current</th>
                  <th className="py-2 text-right font-medium">30d</th>
                  <th className="py-2 text-right font-medium">60d</th>
                  <th className="py-2 text-right font-medium">90+d</th>
                  <th className="py-2 text-right font-medium">Past due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.tenant_id}
                    className="border-b align-top last:border-b-0"
                  >
                    <td className="py-2">
                      <div className="font-medium">{r.tenant_name}</div>
                      {r.tenant_email ? (
                        <div className="text-xs text-muted-foreground">
                          {r.tenant_email}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <div>{r.property_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.unit_number ? `Unit ${r.unit_number}` : ""}
                      </div>
                    </td>
                    <td className="py-2">
                      {r.lease_status ? (
                        <StatusBadge
                          tone={LEASE_STATUS_META[r.lease_status].tone}
                        >
                          {LEASE_STATUS_META[r.lease_status].label}
                        </StatusBadge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No lease
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {r.monthly_rent != null
                        ? formatAmount(r.monthly_rent)
                        : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatAmount(r.current)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatAmount(r.days_30)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatAmount(r.days_60)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-destructive">
                      {formatAmount(r.days_90_plus)}
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      {formatAmount(r.total_past_due)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-medium">
                  <td colSpan={4} className="py-2 text-right">
                    Totals
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatAmount(totals.current)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatAmount(totals.days_30)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatAmount(totals.days_60)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatAmount(totals.days_90_plus)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatAmount(totals.total_past_due)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

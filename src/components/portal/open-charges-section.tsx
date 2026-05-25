import { CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RENT_CHARGE_STATUS_META,
  RENT_CHARGE_TYPE_META,
} from "@/lib/constants";
import type { RentChargeRow } from "@/lib/data/rent-charges";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAmount(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isPastDue(dueDate: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

export function OpenChargesSection({
  charges,
}: {
  charges: RentChargeRow[];
}) {
  if (charges.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open charges</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={CheckCircle2}
            title="All caught up"
            description="No open charges right now."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open charges</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {charges.map((charge) => {
            const typeMeta = RENT_CHARGE_TYPE_META[charge.charge_type];
            const statusMeta = RENT_CHARGE_STATUS_META[charge.status];
            const overdue = isPastDue(charge.due_date);
            return (
              <li
                key={charge.id}
                className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <StatusBadge tone={typeMeta.tone}>
                      {typeMeta.label}
                    </StatusBadge>
                    <span className="text-sm font-medium">
                      {charge.description ?? "Charge"}
                    </span>
                  </div>
                  <p
                    className={
                      overdue
                        ? "text-xs font-medium text-destructive"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    Due {formatDate(charge.due_date)}
                    {overdue ? " · Past due" : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <span className="text-base font-semibold tabular-nums">
                    {formatAmount(charge.amount_due)}
                  </span>
                  <StatusBadge tone={statusMeta.tone}>
                    {statusMeta.label}
                  </StatusBadge>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

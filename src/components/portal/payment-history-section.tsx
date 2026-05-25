import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PAYMENT_METHOD_META } from "@/lib/constants";
import type { PaymentRow } from "@/lib/data/payments";

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

export function PaymentHistorySection({
  payments,
}: {
  payments: PaymentRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment history</CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No payments recorded yet.
          </p>
        ) : (
          <ul className="divide-y">
            {payments.map((payment) => {
              const methodMeta = PAYMENT_METHOD_META[payment.method];
              return (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-medium">
                      {formatDate(payment.paid_at)}
                    </p>
                    {payment.charge_description || payment.charge_due_date ? (
                      <p className="text-xs text-muted-foreground">
                        For: {payment.charge_description ?? "Charge"}
                        {payment.charge_due_date
                          ? ` · Due ${formatDate(payment.charge_due_date)}`
                          : ""}
                      </p>
                    ) : null}
                    {payment.reference ? (
                      <p className="text-xs text-muted-foreground">
                        Ref: {payment.reference}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <span className="text-base font-semibold tabular-nums">
                      {formatAmount(payment.amount_paid)}
                    </span>
                    <StatusBadge tone={methodMeta.tone}>
                      {methodMeta.label}
                    </StatusBadge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/payments/statements/print-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  PAYMENT_METHOD_META,
  RENT_CHARGE_STATUS_META,
  RENT_CHARGE_TYPE_META,
} from "@/lib/constants";
import type { TenantStatement } from "@/lib/data/tenant-statement";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAmount(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPeriod(from: string, to: string): string {
  return `${formatDate(from)} – ${formatDate(to)}`;
}

export function StatementView({
  statement,
  generatedBy,
  orgName,
}: {
  statement: TenantStatement;
  generatedBy: string;
  orgName: string;
}) {
  const {
    tenant,
    unit,
    property,
    period,
    opening_balance,
    charges_in_period,
    payments_in_period,
    total_charges,
    total_payments,
    closing_balance,
    current_balance,
    current_open_charge_count,
    generated_at,
  } = statement;

  // Map charge id → description for the payment "Applied to" column.
  const chargeById = new Map<
    string,
    { description: string | null; due_date: string }
  >();
  for (const c of charges_in_period) {
    chargeById.set(c.id, { description: c.description, due_date: c.due_date });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 print:max-w-none print:space-y-4">
      {/* Screen-only chrome — Print + Back. Hidden on print. */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/payments/statements" />}
        >
          <ArrowLeft className="size-4" />
          Back to picker
        </Button>
        <PrintButton />
      </div>

      {/* Statement header */}
      <header className="space-y-2 border-b pb-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {orgName} · Statement
            </p>
            <h1 className="text-2xl font-semibold">
              {tenant.first_name} {tenant.last_name}
            </h1>
            {tenant.email ? (
              <p className="text-sm text-muted-foreground">{tenant.email}</p>
            ) : null}
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <div>
              {property?.name ?? "—"}
              {unit ? ` · Unit ${unit.unit_number}` : ""}
            </div>
            <div className="mt-1 font-medium text-foreground">
              {formatPeriod(period.from, period.to)}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Generated {formatDateTime(generated_at)} by {generatedBy}
        </p>
      </header>

      {/* Opening balance */}
      <section className="space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Opening balance as of {formatDate(period.from)}
        </h2>
        <p className="text-lg font-semibold tabular-nums">
          {formatAmount(opening_balance)}
        </p>
      </section>

      {/* Charges in period */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Charges
        </h2>
        {charges_in_period.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            No charges posted in this period.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 text-left font-medium">Date</th>
                <th className="py-2 text-left font-medium">Type</th>
                <th className="py-2 text-left font-medium">Description</th>
                <th className="py-2 text-right font-medium">Amount</th>
                <th className="py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {charges_in_period.map((c) => {
                const typeMeta = RENT_CHARGE_TYPE_META[c.charge_type];
                const statusMeta = RENT_CHARGE_STATUS_META[c.status];
                const voided = c.status === "voided";
                return (
                  <tr
                    key={c.id}
                    className="border-b align-top last:border-b-0"
                  >
                    <td className="py-2 tabular-nums">
                      {formatDate(c.due_date)}
                    </td>
                    <td className="py-2">
                      <StatusBadge tone={typeMeta.tone}>
                        {typeMeta.label}
                      </StatusBadge>
                    </td>
                    <td className="py-2">
                      <div>{c.description ?? "—"}</div>
                      {voided && c.void_reason ? (
                        <div className="text-xs text-muted-foreground">
                          Reason: {c.void_reason}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {voided ? (
                        <span className="text-muted-foreground line-through">
                          {formatAmount(c.amount_due)}
                        </span>
                      ) : (
                        formatAmount(c.amount_due)
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <StatusBadge tone={statusMeta.tone}>
                        {statusMeta.label}
                      </StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Payments in period */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Payments
        </h2>
        {payments_in_period.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            No payments received in this period.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 text-left font-medium">Date</th>
                <th className="py-2 text-left font-medium">Method</th>
                <th className="py-2 text-left font-medium">Reference</th>
                <th className="py-2 text-left font-medium">Applied to</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments_in_period.map((p) => {
                const methodMeta = PAYMENT_METHOD_META[p.method];
                const ch = chargeById.get(p.charge_id);
                return (
                  <tr
                    key={p.id}
                    className="border-b align-top last:border-b-0"
                  >
                    <td className="py-2 tabular-nums">
                      {formatDate(p.paid_at)}
                    </td>
                    <td className="py-2">
                      <StatusBadge tone={methodMeta.tone}>
                        {methodMeta.label}
                      </StatusBadge>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {p.reference ?? "—"}
                    </td>
                    <td className="py-2">
                      {ch ? (
                        <>
                          <div>{ch.description ?? "Charge"}</div>
                          <div className="text-xs text-muted-foreground">
                            Due {formatDate(ch.due_date)}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          (charge outside this period)
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatAmount(p.amount_paid)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Period summary at the BOTTOM per audit decision 9. */}
      <section className="space-y-2 border-t pt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Period summary
        </h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm tabular-nums">
          <dt className="text-muted-foreground">Opening balance</dt>
          <dd className="text-right">{formatAmount(opening_balance)}</dd>
          <dt className="text-muted-foreground">Total charges</dt>
          <dd className="text-right">{formatAmount(total_charges)}</dd>
          <dt className="text-muted-foreground">Total payments</dt>
          <dd className="text-right">−{formatAmount(total_payments)}</dd>
          <dt className="border-t pt-1 font-semibold">Closing balance</dt>
          <dd className="border-t pt-1 text-right font-semibold">
            {formatAmount(closing_balance)}
          </dd>
        </dl>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 pt-3 text-sm tabular-nums">
          <dt className="text-muted-foreground">Current balance (today)</dt>
          <dd className="text-right">{formatAmount(current_balance)}</dd>
          <dt className="text-muted-foreground">Open charges (today)</dt>
          <dd className="text-right">{current_open_charge_count}</dd>
        </dl>
      </section>
    </div>
  );
}

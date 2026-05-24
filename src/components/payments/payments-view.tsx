"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Receipt } from "lucide-react";
import { toast } from "sonner";
import { deletePayment } from "@/app/(app)/payments/actions";
import { PaymentFormSheet } from "@/components/payments/payment-form-sheet";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { PAYMENT_METHOD_META } from "@/lib/constants";
import type { PaymentRow } from "@/lib/data/payments";
import type { RentChargeRow } from "@/lib/data/rent-charges";
import type { Payment } from "@/lib/types/app";
import { PAYMENT_METHOD_VALUES } from "@/lib/validations/payment";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
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

export function PaymentsView({
  payments,
  charges,
  canManage,
}: {
  payments: PaymentRow[];
  charges: RentChargeRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);

  // Charges available for new payments (open + partial). Voided and paid
  // are excluded — voided rejects in the action; paid means no balance
  // remaining (though staff can still record overpayment by editing
  // through the rent charges path).
  const payableCharges = charges.filter(
    (c) => c.status === "open" || c.status === "partial",
  );

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(payment: Payment) {
    setEditing(payment);
    setFormOpen(true);
  }

  async function handleDelete(payment: PaymentRow) {
    const result = await deletePayment(payment.id);
    if (result.ok) {
      toast.success("Payment deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const columns: DataTableColumn<PaymentRow>[] = [
    {
      id: "tenant",
      header: "Tenant",
      sortAccessor: (p) => p.tenant_name ?? "",
      cell: (p) =>
        p.tenant_name ? (
          <Link
            href={`/tenants/${p.tenant_id}`}
            className="font-medium hover:underline"
          >
            {p.tenant_name}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      id: "charge",
      header: "Charge",
      cell: (p) => (
        <div className="flex flex-col">
          <span>{p.charge_description ?? "—"}</span>
          <span className="text-xs text-muted-foreground">
            Due {formatDate(p.charge_due_date)}
            {p.charge_amount_due != null
              ? ` · ${formatAmount(p.charge_amount_due)}`
              : ""}
          </span>
        </div>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      sortAccessor: (p) => p.amount_paid,
      cell: (p) => formatAmount(p.amount_paid),
    },
    {
      id: "paid_at",
      header: "Paid at",
      sortAccessor: (p) => p.paid_at,
      cell: (p) => formatDate(p.paid_at),
    },
    {
      id: "method",
      header: "Method",
      cell: (p) => {
        const meta = PAYMENT_METHOD_META[p.method];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
    },
    {
      id: "reference",
      header: "Reference",
      cell: (p) => p.reference ?? "—",
    },
    {
      id: "recorded_by",
      header: "Recorded by",
      cell: (p) => p.recorded_by_name ?? "—",
    },
  ];

  return (
    <>
      <DataTable
        rows={payments}
        columns={columns}
        getRowId={(p) => p.id}
        searchText={(p) =>
          `${p.tenant_name ?? ""} ${p.charge_description ?? ""} ${p.reference ?? ""}`
        }
        searchPlaceholder="Search payments…"
        facet={{
          label: "Method",
          options: PAYMENT_METHOD_VALUES.map((m) => ({
            value: m,
            label: PAYMENT_METHOD_META[m].label,
          })),
          matches: (p, v) => p.method === v,
        }}
        onEdit={canManage ? openEdit : undefined}
        onDelete={canManage ? handleDelete : undefined}
        deleteLabel={(p) =>
          `${formatAmount(p.amount_paid)} from ${p.tenant_name ?? "tenant"}`
        }
        toolbar={
          canManage ? (
            <Button onClick={openNew} disabled={payableCharges.length === 0}>
              <Plus className="size-4" />
              Record payment
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            icon={Receipt}
            title="No payments yet"
            description="Record a payment against an open or partially-paid charge."
            action={
              canManage ? (
                <Button onClick={openNew} disabled={payableCharges.length === 0}>
                  <Plus className="size-4" />
                  Record payment
                </Button>
              ) : undefined
            }
          />
        }
      />
      {canManage ? (
        <PaymentFormSheet
          open={formOpen}
          onOpenChange={setFormOpen}
          payment={editing}
          payableCharges={payableCharges}
          allCharges={charges}
        />
      ) : null}
    </>
  );
}

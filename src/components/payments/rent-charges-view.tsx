"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, CalendarPlus, FileBarChart, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";
import { voidRentCharge } from "@/app/(app)/payments/actions";
import { GenerateChargesDialog } from "@/components/payments/generate-charges-dialog";
import { PaymentFormSheet } from "@/components/payments/payment-form-sheet";
import { RentChargeFormSheet } from "@/components/payments/rent-charge-form-sheet";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  RENT_CHARGE_STATUS_META,
  RENT_CHARGE_TYPE_META,
} from "@/lib/constants";
import type { RentChargeRow } from "@/lib/data/rent-charges";
import type { RentCharge } from "@/lib/types/app";

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

type LeaseOption = {
  id: string;
  unit_id: string;
  start_date: string;
  end_date: string | null;
  monthly_rent: number;
  primary_tenant_id: string | null;
  primary_tenant_name: string | null;
};

export function RentChargesView({
  charges,
  leases,
  tenants,
  units,
  properties,
  canManage,
}: {
  charges: RentChargeRow[];
  leases: LeaseOption[];
  tenants: { id: string; first_name: string; last_name: string; lease_id: string | null }[];
  units: { id: string; unit_number: string }[];
  properties: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RentCharge | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<RentChargeRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidReasonError, setVoidReasonError] = useState<string | null>(null);
  const [voidPending, startVoidTransition] = useTransition();
  const [paymentChargeId, setPaymentChargeId] = useState<string | null>(null);

  function openRecordPayment(charge: RentChargeRow) {
    setPaymentChargeId(charge.id);
  }

  function openVoid(charge: RentChargeRow) {
    setVoidReason("");
    setVoidReasonError(null);
    setVoidTarget(charge);
  }

  function runVoid() {
    const target = voidTarget;
    if (!target) return;
    startVoidTransition(async () => {
      const result = await voidRentCharge(target.id, voidReason);
      if (result.ok) {
        toast.success("Charge voided");
        setVoidTarget(null);
        router.refresh();
      } else {
        if (result.fieldErrors?.void_reason) {
          setVoidReasonError(result.fieldErrors.void_reason);
        }
        toast.error(result.error);
      }
    });
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(charge: RentCharge) {
    setEditing(charge);
    setFormOpen(true);
  }

  function onGenerated(result: {
    created: number;
    skipped: number;
    leases_without_tenants: number;
    propertyName: string;
    period: string;
  }) {
    if (result.created === 0 && result.skipped === 0 && result.leases_without_tenants === 0) {
      toast.info(`No active leases on ${result.propertyName} for ${result.period}.`);
    } else {
      const parts = [
        `Created ${result.created} charge${result.created === 1 ? "" : "s"}`,
      ];
      if (result.skipped > 0) parts.push(`skipped ${result.skipped} existing`);
      if (result.leases_without_tenants > 0) {
        parts.push(`${result.leases_without_tenants} lease${result.leases_without_tenants === 1 ? "" : "s"} had no tenants`);
      }
      toast.success(
        `${parts.join("; ")} for ${result.period} on ${result.propertyName}.`,
      );
    }
    router.refresh();
  }

  const columns: DataTableColumn<RentChargeRow>[] = [
    {
      id: "tenant",
      header: "Tenant",
      sortAccessor: (c) => c.tenant_name ?? "",
      cell: (c) =>
        c.tenant_name ? (
          <Link
            href={`/tenants/${c.tenant_id}`}
            className="font-medium hover:underline"
          >
            {c.tenant_name}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      id: "unit",
      header: "Unit",
      sortAccessor: (c) => c.unit_number ?? "",
      cell: (c) => c.unit_number ?? "—",
    },
    {
      id: "lease",
      header: "Lease",
      cell: (c) => {
        if (!c.lease_start_date) return "—";
        const start = formatDate(c.lease_start_date);
        const end = c.lease_end_date ? formatDate(c.lease_end_date) : "open";
        return (
          <span className="text-xs text-muted-foreground">
            {start} – {end}
          </span>
        );
      },
    },
    {
      id: "type",
      header: "Type",
      cell: (c) => {
        const meta = RENT_CHARGE_TYPE_META[c.charge_type];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
    },
    {
      id: "amount",
      header: "Amount",
      sortAccessor: (c) => c.amount_due,
      cell: (c) => formatAmount(c.amount_due),
    },
    {
      id: "due",
      header: "Due",
      sortAccessor: (c) => c.due_date,
      cell: (c) => formatDate(c.due_date),
    },
    {
      id: "status",
      header: "Status",
      sortAccessor: (c) => c.status,
      cell: (c) => {
        const meta = RENT_CHARGE_STATUS_META[c.status];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
    },
    {
      id: "voided",
      header: "Voided",
      cell: (c) => formatDate(c.voided_at),
    },
  ];

  return (
    <>
      <DataTable
        rows={charges}
        columns={columns}
        getRowId={(c) => c.id}
        searchText={(c) =>
          `${c.tenant_name ?? ""} ${c.unit_number ?? ""} ${c.description ?? ""}`
        }
        searchPlaceholder="Search charges…"
        facet={{
          label: "Status",
          options: (
            ["open", "paid", "partial", "voided"] as const
          ).map((s) => ({
            value: s,
            label: RENT_CHARGE_STATUS_META[s].label,
          })),
          matches: (c, v) => c.status === v,
        }}
        onEdit={canManage ? openEdit : undefined}
        rowActions={
          canManage
            ? (charge) => {
                const canPay =
                  charge.status !== "voided" && charge.status !== "paid";
                const canVoid = charge.status !== "voided";
                if (!canPay && !canVoid) return null;
                return (
                  <>
                    {canPay ? (
                      <DropdownMenuItem
                        onClick={() => openRecordPayment(charge)}
                      >
                        <Receipt className="size-4" />
                        Record payment
                      </DropdownMenuItem>
                    ) : null}
                    {canVoid ? (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => openVoid(charge)}
                      >
                        <Ban className="size-4" />
                        Void
                      </DropdownMenuItem>
                    ) : null}
                  </>
                );
              }
            : undefined
        }
        toolbar={
          canManage ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setGenerateOpen(true)}>
                <CalendarPlus className="size-4" />
                Generate for property
              </Button>
              <Button onClick={openNew}>
                <Plus className="size-4" />
                New rent charge
              </Button>
            </div>
          ) : undefined
        }
        emptyState={
          <EmptyState
            icon={FileBarChart}
            title="No rent charges yet"
            description="Record a charge manually or generate this month's rent for a property."
            action={
              canManage ? (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setGenerateOpen(true)}>
                    <CalendarPlus className="size-4" />
                    Generate for property
                  </Button>
                  <Button onClick={openNew}>
                    <Plus className="size-4" />
                    New rent charge
                  </Button>
                </div>
              ) : undefined
            }
          />
        }
      />
      {canManage ? (
        <>
          <RentChargeFormSheet
            open={formOpen}
            onOpenChange={setFormOpen}
            charge={editing}
            leases={leases}
            tenants={tenants}
            units={units}
          />
          <GenerateChargesDialog
            open={generateOpen}
            onOpenChange={setGenerateOpen}
            properties={properties}
            onSuccess={onGenerated}
          />
          <PaymentFormSheet
            open={paymentChargeId !== null}
            onOpenChange={(o) => {
              if (!o) setPaymentChargeId(null);
            }}
            payment={null}
            prescopedChargeId={paymentChargeId ?? undefined}
            payableCharges={charges.filter(
              (c) => c.status === "open" || c.status === "partial",
            )}
            allCharges={charges}
          />
          <AlertDialog
            open={voidTarget !== null}
            onOpenChange={(open) => {
              if (!open) setVoidTarget(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Void this charge?</AlertDialogTitle>
                <AlertDialogDescription>
                  {voidTarget
                    ? `${voidTarget.tenant_name ?? "This charge"} — ${formatAmount(voidTarget.amount_due)} due ${formatDate(voidTarget.due_date)}. Voided charges remain in the ledger for audit purposes and are excluded from delinquency aging.`
                    : "Voided charges remain in the ledger for audit purposes."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <label htmlFor="void_reason" className="text-sm font-medium">
                  Void reason <span className="text-destructive">*</span>
                </label>
                <Textarea
                  id="void_reason"
                  rows={3}
                  value={voidReason}
                  onChange={(e) => {
                    setVoidReason(e.target.value);
                    if (voidReasonError) setVoidReasonError(null);
                  }}
                  placeholder="e.g. Duplicate of charge #1234; refunded by check #567"
                  required
                />
                {voidReasonError ? (
                  <p className="text-xs text-destructive">{voidReasonError}</p>
                ) : null}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={voidPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={voidPending}
                  onClick={runVoid}
                >
                  {voidPending ? "Voiding…" : "Void charge"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </>
  );
}

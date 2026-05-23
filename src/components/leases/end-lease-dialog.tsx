"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { endLease } from "@/app/(app)/leases/actions";
import { formatTenants } from "@/components/leases/leases-view";
import { Field } from "@/components/shared/field";
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
import { Input } from "@/components/ui/input";
import type { LeaseRow } from "@/lib/data/leases";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatRent(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function EndLeaseDialog({
  open,
  onOpenChange,
  lease,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lease: LeaseRow | null;
  onSuccess?: () => void;
}) {
  const [endDate, setEndDate] = useState<string>(() => todayISO());
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize when the dialog opens or switches lease.
  // Render-phase reset — React's recommended alternative to an effect.
  const formKey = open ? (lease?.id ?? "__none__") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setEndDate(todayISO());
      setFormError(null);
    }
  }

  function runEnd() {
    if (!lease) return;
    startTransition(async () => {
      const result = await endLease(lease.id, endDate);
      if (result.ok) {
        toast.success("Lease ended");
        onOpenChange(false);
        onSuccess?.();
      } else {
        setFormError(result.error);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End this lease?</AlertDialogTitle>
          <AlertDialogDescription>
            This sets the lease to Ended and stamps the end date. The unit will
            be available for a new lease. Tenants remain attached to this lease
            record.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {lease ? (
          <div className="space-y-4 py-1">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Unit</dt>
              <dd>
                {lease.unit_number ?? "—"}
                {lease.property_name ? ` · ${lease.property_name}` : ""}
              </dd>
              <dt className="text-muted-foreground">Tenants</dt>
              <dd>{formatTenants(lease.tenants)}</dd>
              <dt className="text-muted-foreground">Start date</dt>
              <dd>{lease.start_date}</dd>
              <dt className="text-muted-foreground">Monthly rent</dt>
              <dd>{formatRent(lease.monthly_rent)}</dd>
            </dl>

            <Field
              label="End date"
              htmlFor="end_lease_date"
              required
              error={formError ?? undefined}
            >
              <Input
                id="end_lease_date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={lease.start_date}
              />
            </Field>
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={runEnd}
          >
            {pending ? "Ending…" : "End lease"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

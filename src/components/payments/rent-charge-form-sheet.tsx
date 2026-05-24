"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createRentCharge,
  updateRentCharge,
} from "@/app/(app)/payments/actions";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { RENT_CHARGE_TYPE_META } from "@/lib/constants";
import type { RentCharge, RentChargeType } from "@/lib/types/app";
import { RENT_CHARGE_TYPE_VALUES } from "@/lib/validations/rent-charge";

type LeaseOption = {
  id: string;
  unit_id: string;
  start_date: string;
  end_date: string | null;
  monthly_rent: number;
  primary_tenant_id: string | null;
  primary_tenant_name: string | null;
};

type TenantOption = {
  id: string;
  first_name: string;
  last_name: string;
  lease_id: string | null;
};

type FormValues = {
  lease_id: string;
  tenant_id: string;
  unit_id: string;
  charge_type: RentChargeType;
  amount_due: string;
  due_date: string;
  period_start: string;
  period_end: string;
  description: string;
  notes: string;
};

function toFormValues(charge: RentCharge | null): FormValues {
  return {
    lease_id: charge?.lease_id ?? "",
    tenant_id: charge?.tenant_id ?? "",
    unit_id: charge?.unit_id ?? "",
    charge_type: charge?.charge_type ?? "rent",
    amount_due: charge?.amount_due != null ? String(charge.amount_due) : "",
    due_date: charge?.due_date ?? "",
    period_start: charge?.period_start ?? "",
    period_end: charge?.period_end ?? "",
    description: charge?.description ?? "",
    notes: charge?.notes ?? "",
  };
}

export function RentChargeFormSheet({
  open,
  onOpenChange,
  charge,
  leases,
  tenants,
  units,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charge: RentCharge | null;
  leases: LeaseOption[];
  tenants: TenantOption[];
  units: { id: string; unit_number: string }[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const isEdit = charge !== null;
  const [values, setValues] = useState<FormValues>(() =>
    toFormValues(charge),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const formKey = open ? (charge?.id ?? "new") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(toFormValues(charge));
      setErrors({});
      setFormError(null);
    }
  }

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Auto-fill on lease pick: tenant (first alphabetical on that lease),
   * unit (lease.unit_id), amount_due (lease.monthly_rent). All three are
   * defaults — staff can override any field afterward.
   */
  function pickLease(leaseId: string) {
    const lease = leases.find((l) => l.id === leaseId);
    setValues((prev) => ({
      ...prev,
      lease_id: leaseId,
      ...(lease
        ? {
            tenant_id: lease.primary_tenant_id ?? prev.tenant_id,
            unit_id: lease.unit_id,
            amount_due:
              prev.amount_due.length > 0
                ? prev.amount_due
                : String(lease.monthly_rent),
          }
        : {}),
    }));
  }

  // Tenants filtered to the picked lease (when one is picked) for the
  // override dropdown. When no lease is picked, show all (rare path).
  const tenantsForLease = values.lease_id
    ? tenants.filter((t) => t.lease_id === values.lease_id)
    : tenants;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = charge
        ? await updateRentCharge(charge.id, values)
        : await createRentCharge(values);
      if (result.ok) {
        toast.success(isEdit ? "Charge updated" : "Charge created");
        onOpenChange(false);
        if (onSuccess) onSuccess();
        else router.refresh();
      } else {
        setFormError(result.error);
        setErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>
              {isEdit ? "Edit rent charge" : "New rent charge"}
            </SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Once a charge has payments, only notes and description are editable."
                : "Pick a lease — tenant, unit, and amount pre-fill from the lease."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <Field label="Lease" required error={errors.lease_id}>
              <Select
                value={values.lease_id}
                onValueChange={(v) => pickLease(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a lease" />
                </SelectTrigger>
                <SelectContent>
                  {leases.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.primary_tenant_name ?? "(no tenant yet)"} —{" "}
                      {l.start_date}
                      {l.end_date ? ` to ${l.end_date}` : " (open)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tenant" required error={errors.tenant_id}>
                <Select
                  value={values.tenant_id}
                  onValueChange={(v) => set("tenant_id", v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenantsForLease.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.first_name} {t.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Unit" required error={errors.unit_id}>
                <Select
                  value={values.unit_id}
                  onValueChange={(v) => set("unit_id", v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.unit_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Type" error={errors.charge_type}>
                <Select
                  value={values.charge_type}
                  onValueChange={(v) =>
                    set("charge_type", (v ?? "rent") as RentChargeType)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RENT_CHARGE_TYPE_VALUES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {RENT_CHARGE_TYPE_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Amount due"
                htmlFor="amount_due"
                required
                error={errors.amount_due}
              >
                <Input
                  id="amount_due"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={values.amount_due}
                  onChange={(e) => set("amount_due", e.target.value)}
                  required
                />
              </Field>
            </div>

            <Field
              label="Due date"
              htmlFor="due_date"
              required
              error={errors.due_date}
            >
              <Input
                id="due_date"
                type="date"
                value={values.due_date}
                onChange={(e) => set("due_date", e.target.value)}
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Period start"
                htmlFor="period_start"
                hint="Optional"
                error={errors.period_start}
              >
                <Input
                  id="period_start"
                  type="date"
                  value={values.period_start}
                  onChange={(e) => set("period_start", e.target.value)}
                />
              </Field>
              <Field
                label="Period end"
                htmlFor="period_end"
                hint="Optional"
                error={errors.period_end}
              >
                <Input
                  id="period_end"
                  type="date"
                  value={values.period_end}
                  onChange={(e) => set("period_end", e.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Description"
              htmlFor="description"
              hint='e.g. "April 2026 rent"'
              error={errors.description}
            >
              <Input
                id="description"
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>

            <Field label="Notes" htmlFor="notes" error={errors.notes}>
              <Textarea
                id="notes"
                rows={2}
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>

            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}
          </div>

          <SheetFooter className="flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Create charge"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

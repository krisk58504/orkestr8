"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  recordPayment,
  updatePayment,
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
import { PAYMENT_METHOD_META } from "@/lib/constants";
import type { RentChargeRow } from "@/lib/data/rent-charges";
import type { Payment, PaymentMethod } from "@/lib/types/app";
import { PAYMENT_METHOD_VALUES } from "@/lib/validations/payment";

type FormValues = {
  charge_id: string;
  tenant_id: string;
  amount_paid: string;
  paid_at: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
};

function nowDateTimeLocal(): string {
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toFormValues(
  payment: Payment | null,
  defaultChargeId?: string,
  defaultTenantId?: string,
  defaultAmount?: string,
): FormValues {
  return {
    charge_id: payment?.charge_id ?? defaultChargeId ?? "",
    tenant_id: payment?.tenant_id ?? defaultTenantId ?? "",
    amount_paid:
      payment?.amount_paid != null
        ? String(payment.amount_paid)
        : (defaultAmount ?? ""),
    paid_at: payment?.paid_at
      ? new Date(payment.paid_at).toISOString().slice(0, 16)
      : nowDateTimeLocal(),
    method: payment?.method ?? "check",
    reference: payment?.reference ?? "",
    notes: payment?.notes ?? "",
  };
}

/**
 * Two modes:
 *   - `payment` non-null (edit) → all fields editable except charge_id
 *     (charge picker hidden; charge cannot be reassigned per action layer)
 *   - `payment` null (create):
 *     - `prescopedChargeId` non-undefined → picker hidden, locked to that
 *       charge (from charges-tab kebab)
 *     - `prescopedChargeId` undefined → picker shown, filtered to
 *       payable charges (from payments-tab toolbar)
 */
export function PaymentFormSheet({
  open,
  onOpenChange,
  payment,
  prescopedChargeId,
  payableCharges,
  allCharges,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: Payment | null;
  prescopedChargeId?: string;
  payableCharges: RentChargeRow[];
  allCharges: RentChargeRow[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const isEdit = payment !== null;

  // For edit mode, look up the existing charge to derive defaults.
  // For create-prescoped mode, look it up in allCharges.
  const initialCharge = useMemo(() => {
    const id = payment?.charge_id ?? prescopedChargeId;
    if (!id) return null;
    return (
      payableCharges.find((c) => c.id === id) ??
      allCharges.find((c) => c.id === id) ??
      null
    );
  }, [payment, prescopedChargeId, payableCharges, allCharges]);

  const defaultRemaining =
    initialCharge && !isEdit
      ? Math.max(0, initialCharge.amount_due).toFixed(2)
      : undefined;

  const [values, setValues] = useState<FormValues>(() =>
    toFormValues(
      payment,
      prescopedChargeId,
      initialCharge?.tenant_id,
      defaultRemaining,
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const formKey = open
    ? `${payment?.id ?? "new"}::${prescopedChargeId ?? ""}`
    : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(
        toFormValues(
          payment,
          prescopedChargeId,
          initialCharge?.tenant_id,
          defaultRemaining,
        ),
      );
      setErrors({});
      setFormError(null);
    }
  }

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function pickCharge(chargeId: string) {
    const charge = allCharges.find((c) => c.id === chargeId) ?? null;
    setValues((prev) => ({
      ...prev,
      charge_id: chargeId,
      ...(charge
        ? {
            tenant_id: charge.tenant_id,
            // Pre-fill amount with the charge's full amount_due. Walk-test
            // will tell us if "remaining balance" auto-fill is worth a
            // server-call to computeChargeBalance per-pick; for now the
            // full amount is a reasonable default that staff overrides.
            amount_paid:
              prev.amount_paid.length > 0
                ? prev.amount_paid
                : String(charge.amount_due),
          }
        : {}),
    }));
  }

  const isChargePickerVisible = !isEdit && !prescopedChargeId;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = payment
        ? await updatePayment(payment.id, values)
        : await recordPayment(values);
      if (result.ok) {
        toast.success(isEdit ? "Payment updated" : "Payment recorded");
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
              {isEdit ? "Edit payment" : "Record payment"}
            </SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Adjust the recorded payment. The parent charge's status will recompute if the amount changes."
                : isChargePickerVisible
                  ? "Pick a charge and record what the tenant paid."
                  : "Record what the tenant paid against this charge."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {isChargePickerVisible ? (
              <Field label="Charge" required error={errors.charge_id}>
                <Select
                  value={values.charge_id}
                  onValueChange={(v) => pickCharge(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a charge" />
                  </SelectTrigger>
                  <SelectContent>
                    {payableCharges.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.tenant_name ?? "(no tenant)"} — {c.description ?? "Charge"} —{" "}
                        ${Number(c.amount_due).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
                <div className="text-muted-foreground">Charge</div>
                <div className="font-medium">
                  {initialCharge?.tenant_name ?? "—"} —{" "}
                  {initialCharge?.description ?? "Charge"} —{" "}
                  $
                  {initialCharge
                    ? Number(initialCharge.amount_due).toFixed(2)
                    : "—"}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Amount"
                htmlFor="amount_paid"
                required
                error={errors.amount_paid}
              >
                <Input
                  id="amount_paid"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={values.amount_paid}
                  onChange={(e) => set("amount_paid", e.target.value)}
                  required
                />
              </Field>
              <Field label="Method" error={errors.method}>
                <Select
                  value={values.method}
                  onValueChange={(v) =>
                    set("method", (v ?? "check") as PaymentMethod)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_VALUES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_META[m].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field
              label="Paid at"
              htmlFor="paid_at"
              required
              error={errors.paid_at}
            >
              <Input
                id="paid_at"
                type="datetime-local"
                value={values.paid_at}
                onChange={(e) => set("paid_at", e.target.value)}
                required
              />
            </Field>

            <Field
              label="Reference"
              htmlFor="reference"
              hint="Check number, transaction id, etc."
              error={errors.reference}
            >
              <Input
                id="reference"
                value={values.reference}
                onChange={(e) => set("reference", e.target.value)}
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
                  : "Record payment"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

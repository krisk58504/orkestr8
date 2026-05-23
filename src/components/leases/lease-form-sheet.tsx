"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createLease, updateLease } from "@/app/(app)/leases/actions";
import { Field } from "@/components/shared/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { LEASE_STATUS_META } from "@/lib/constants";
import type { LeaseRow } from "@/lib/data/leases";
import type { LeaseStatus } from "@/lib/types/app";

const SELECTABLE_LEASE_STATUSES = ["upcoming", "active"] as const;

type FormValues = {
  property_id: string;
  unit_id: string;
  start_date: string;
  end_date: string;
  monthly_rent: string;
  status: LeaseStatus;
  notes: string;
  tenant_ids: string[];
};

function toFormValues(
  lease: LeaseRow | null,
  unitOptions: { id: string; property_id: string }[],
): FormValues {
  const unit = lease
    ? unitOptions.find((u) => u.id === lease.unit_id)
    : undefined;
  return {
    property_id: unit?.property_id ?? "none",
    unit_id: lease?.unit_id ?? "",
    start_date: lease?.start_date ?? "",
    end_date: lease?.end_date ?? "",
    monthly_rent:
      lease?.monthly_rent != null ? String(lease.monthly_rent) : "",
    status: lease?.status ?? "upcoming",
    notes: lease?.notes ?? "",
    tenant_ids: lease?.tenants.map((t) => t.id) ?? [],
  };
}

export function LeaseFormSheet({
  open,
  onOpenChange,
  lease,
  propertyOptions,
  unitOptions,
  tenantOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lease: LeaseRow | null;
  propertyOptions: { id: string; name: string }[];
  unitOptions: { id: string; unit_number: string; property_id: string }[];
  tenantOptions: {
    id: string;
    first_name: string;
    last_name: string;
    lease_id: string | null;
  }[];
}) {
  const router = useRouter();
  const isEdit = lease !== null;
  const [values, setValues] = useState<FormValues>(() =>
    toFormValues(lease, unitOptions),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize the form when the sheet opens or switches record.
  // Render-phase reset — React's recommended alternative to an effect.
  const formKey = open ? (lease?.id ?? "new") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(toFormValues(lease, unitOptions));
      setErrors({});
      setFormError(null);
    }
  }

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const filteredUnits = useMemo(
    () =>
      values.property_id === "none"
        ? []
        : unitOptions.filter((u) => u.property_id === values.property_id),
    [unitOptions, values.property_id],
  );

  // A tenant is selectable when they're free or already on this lease.
  // Tenants attached to a different lease are listed but disabled — moving
  // them must go through that other lease.
  const tenantRows = useMemo(
    () =>
      tenantOptions.map((t) => ({
        ...t,
        unavailable: t.lease_id !== null && t.lease_id !== lease?.id,
      })),
    [tenantOptions, lease?.id],
  );

  function toggleTenant(id: string, checked: boolean) {
    setValues((prev) => ({
      ...prev,
      tenant_ids: checked
        ? [...prev.tenant_ids, id]
        : prev.tenant_ids.filter((t) => t !== id),
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = lease
        ? await updateLease(lease.id, values)
        : await createLease(values);
      if (result.ok) {
        toast.success(isEdit ? "Lease updated" : "Lease created");
        onOpenChange(false);
        router.refresh();
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
            <SheetTitle>{isEdit ? "Edit lease" : "New lease"}</SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update the details for this lease."
                : "Create a lease and assign its tenants."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <Field label="Property" error={errors.property_id}>
              <Select
                value={values.property_id}
                onValueChange={(v) => {
                  set("property_id", v ?? "none");
                  set("unit_id", "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select a property</SelectItem>
                  {propertyOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Unit" required error={errors.unit_id}>
              <Select
                value={values.unit_id}
                onValueChange={(v) => set("unit_id", v ?? "")}
                disabled={values.property_id === "none"}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {filteredUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.unit_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Tenants" error={errors.tenant_ids}>
              {tenantRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No tenants in your organization yet.
                </p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                  {tenantRows.map((t) => {
                    const checked = values.tenant_ids.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 rounded px-1 py-1 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          disabled={t.unavailable}
                          onCheckedChange={(c) => toggleTenant(t.id, c === true)}
                        />
                        <span
                          className={
                            t.unavailable ? "text-muted-foreground" : undefined
                          }
                        >
                          {t.first_name} {t.last_name}
                        </span>
                        {t.unavailable ? (
                          <Badge variant="outline" className="ml-auto">
                            On another lease
                          </Badge>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Start date"
                htmlFor="start_date"
                required
                error={errors.start_date}
              >
                <Input
                  id="start_date"
                  type="date"
                  value={values.start_date}
                  onChange={(e) => set("start_date", e.target.value)}
                  required
                />
              </Field>
              <Field
                label="End date"
                htmlFor="end_date"
                error={errors.end_date}
              >
                <Input
                  id="end_date"
                  type="date"
                  value={values.end_date}
                  onChange={(e) => set("end_date", e.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Monthly rent"
              htmlFor="monthly_rent"
              required
              error={errors.monthly_rent}
            >
              <Input
                id="monthly_rent"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={values.monthly_rent}
                onChange={(e) => set("monthly_rent", e.target.value)}
                required
              />
            </Field>

            <Field label="Status" error={errors.status}>
              <Select
                value={values.status}
                onValueChange={(v) =>
                  set("status", (v ?? "upcoming") as LeaseStatus)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SELECTABLE_LEASE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEASE_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Notes" htmlFor="notes" error={errors.notes}>
              <Textarea
                id="notes"
                rows={3}
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
                  : "Create lease"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createTenant, updateTenant } from "@/app/(app)/tenants/actions";
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
import { TENANT_STATUS_META } from "@/lib/constants";
import type { Tenant, TenantStatus } from "@/lib/types/app";
import { TENANT_STATUS_VALUES } from "@/lib/validations/tenant";

type FormValues = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: TenantStatus;
  property_id: string;
  unit_id: string;
  date_of_birth: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  move_in_date: string;
  move_out_date: string;
  notes: string;
};

function toFormValues(tenant: Tenant | null): FormValues {
  return {
    first_name: tenant?.first_name ?? "",
    last_name: tenant?.last_name ?? "",
    email: tenant?.email ?? "",
    phone: tenant?.phone ?? "",
    status: tenant?.status ?? "current",
    property_id: tenant?.property_id ?? "none",
    unit_id: tenant?.unit_id ?? "none",
    date_of_birth: tenant?.date_of_birth ?? "",
    emergency_contact_name: tenant?.emergency_contact_name ?? "",
    emergency_contact_phone: tenant?.emergency_contact_phone ?? "",
    move_in_date: tenant?.move_in_date ?? "",
    move_out_date: tenant?.move_out_date ?? "",
    notes: tenant?.notes ?? "",
  };
}

export function TenantFormSheet({
  open,
  onOpenChange,
  tenant,
  propertyOptions,
  unitOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: Tenant | null;
  propertyOptions: { id: string; name: string }[];
  unitOptions: { id: string; unit_number: string; property_id: string }[];
}) {
  const router = useRouter();
  const isEdit = tenant !== null;
  const [values, setValues] = useState<FormValues>(() => toFormValues(tenant));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize the form when the sheet opens or switches record.
  // Render-phase reset — React's recommended alternative to an effect.
  const formKey = open ? (tenant?.id ?? "new") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(toFormValues(tenant));
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = tenant
        ? await updateTenant(tenant.id, values)
        : await createTenant(values);
      if (result.ok) {
        toast.success(isEdit ? "Tenant updated" : "Tenant created");
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
            <SheetTitle>{isEdit ? "Edit tenant" : "New tenant"}</SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update the details for this tenant."
                : "Add a tenant to your organization."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="First name"
                htmlFor="first_name"
                required
                error={errors.first_name}
              >
                <Input
                  id="first_name"
                  value={values.first_name}
                  onChange={(e) => set("first_name", e.target.value)}
                  required
                />
              </Field>
              <Field
                label="Last name"
                htmlFor="last_name"
                required
                error={errors.last_name}
              >
                <Input
                  id="last_name"
                  value={values.last_name}
                  onChange={(e) => set("last_name", e.target.value)}
                  required
                />
              </Field>
            </div>

            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input
                id="email"
                type="email"
                value={values.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>

            <Field label="Phone" htmlFor="phone" error={errors.phone}>
              <Input
                id="phone"
                value={values.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>

            <Field label="Status" error={errors.status}>
              <Select
                value={values.status}
                onValueChange={(v) =>
                  set("status", (v ?? "current") as TenantStatus)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TENANT_STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {TENANT_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Property" error={errors.property_id}>
              <Select
                value={values.property_id}
                onValueChange={(v) => {
                  set("property_id", v ?? "none");
                  set("unit_id", "none");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No property</SelectItem>
                  {propertyOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Unit" error={errors.unit_id}>
              <Select
                value={values.unit_id}
                onValueChange={(v) => set("unit_id", v ?? "none")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No unit</SelectItem>
                  {filteredUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.unit_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Date of birth"
              htmlFor="date_of_birth"
              error={errors.date_of_birth}
            >
              <Input
                id="date_of_birth"
                type="date"
                value={values.date_of_birth}
                onChange={(e) => set("date_of_birth", e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Move-in date"
                htmlFor="move_in_date"
                error={errors.move_in_date}
              >
                <Input
                  id="move_in_date"
                  type="date"
                  value={values.move_in_date}
                  onChange={(e) => set("move_in_date", e.target.value)}
                />
              </Field>
              <Field
                label="Move-out date"
                htmlFor="move_out_date"
                error={errors.move_out_date}
              >
                <Input
                  id="move_out_date"
                  type="date"
                  value={values.move_out_date}
                  onChange={(e) => set("move_out_date", e.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Emergency contact name"
              htmlFor="emergency_contact_name"
              error={errors.emergency_contact_name}
            >
              <Input
                id="emergency_contact_name"
                value={values.emergency_contact_name}
                onChange={(e) =>
                  set("emergency_contact_name", e.target.value)
                }
              />
            </Field>

            <Field
              label="Emergency contact phone"
              htmlFor="emergency_contact_phone"
              error={errors.emergency_contact_phone}
            >
              <Input
                id="emergency_contact_phone"
                value={values.emergency_contact_phone}
                onChange={(e) =>
                  set("emergency_contact_phone", e.target.value)
                }
              />
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
                  : "Create tenant"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

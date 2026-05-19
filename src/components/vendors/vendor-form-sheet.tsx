"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createVendor, updateVendor } from "@/app/(app)/vendors/actions";
import { Field } from "@/components/shared/field";
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
import { US_STATES, VENDOR_STATUS_META } from "@/lib/constants";
import type { Vendor, VendorStatus } from "@/lib/types/app";
import { VENDOR_STATUS_VALUES } from "@/lib/validations/vendor";

type FormValues = {
  name: string;
  trade: string;
  status: VendorStatus;
  email: string;
  phone: string;
  website: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  notes: string;
  is_active: boolean;
};

function toFormValues(vendor: Vendor | null): FormValues {
  return {
    name: vendor?.name ?? "",
    trade: vendor?.trade ?? "",
    status: vendor?.status ?? "active",
    email: vendor?.email ?? "",
    phone: vendor?.phone ?? "",
    website: vendor?.website ?? "",
    address_line1: vendor?.address_line1 ?? "",
    city: vendor?.city ?? "",
    state: vendor?.state ?? "",
    postal_code: vendor?.postal_code ?? "",
    notes: vendor?.notes ?? "",
    is_active: vendor?.is_active ?? true,
  };
}

export function VendorFormSheet({
  open,
  onOpenChange,
  vendor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor: Vendor | null;
}) {
  const router = useRouter();
  const isEdit = vendor !== null;
  const [values, setValues] = useState<FormValues>(() => toFormValues(vendor));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize the form when the sheet opens or switches record.
  // Render-phase reset — React's recommended alternative to an effect.
  const formKey = open ? (vendor?.id ?? "new") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(toFormValues(vendor));
      setErrors({});
      setFormError(null);
    }
  }

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = vendor
        ? await updateVendor(vendor.id, values)
        : await createVendor(values);
      if (result.ok) {
        toast.success(isEdit ? "Vendor updated" : "Vendor created");
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
            <SheetTitle>{isEdit ? "Edit vendor" : "New vendor"}</SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update the details for this vendor."
                : "Add a vendor to your directory."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <Field
              label="Vendor name"
              htmlFor="name"
              required
              error={errors.name}
            >
              <Input
                id="name"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                required
              />
            </Field>

            <Field label="Trade" htmlFor="trade" error={errors.trade}>
              <Input
                id="trade"
                value={values.trade}
                onChange={(e) => set("trade", e.target.value)}
                placeholder="e.g. Plumbing, HVAC"
              />
            </Field>

            <Field label="Status" error={errors.status}>
              <Select
                value={values.status}
                onValueChange={(v) =>
                  set("status", (v ?? "active") as VendorStatus)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {VENDOR_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
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
            </div>

            <Field label="Website" htmlFor="website" error={errors.website}>
              <Input
                id="website"
                value={values.website}
                onChange={(e) => set("website", e.target.value)}
                placeholder="https://"
              />
            </Field>

            <Field
              label="Address"
              htmlFor="address_line1"
              error={errors.address_line1}
            >
              <Input
                id="address_line1"
                value={values.address_line1}
                onChange={(e) => set("address_line1", e.target.value)}
                placeholder="Street address"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="City" htmlFor="city" error={errors.city}>
                <Input
                  id="city"
                  value={values.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              </Field>
              <Field label="State" error={errors.state}>
                <Select
                  value={values.state}
                  onValueChange={(v) => set("state", v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.value} — {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field
              label="Postal code"
              htmlFor="postal_code"
              error={errors.postal_code}
            >
              <Input
                id="postal_code"
                value={values.postal_code}
                onChange={(e) => set("postal_code", e.target.value)}
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

            {isEdit ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={values.is_active}
                  onCheckedChange={(c) => set("is_active", c === true)}
                />
                Active vendor
              </label>
            ) : null}

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
                  : "Create vendor"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createProperty, updateProperty } from "@/app/(app)/properties/actions";
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
import { PROPERTY_TYPE_LABELS, US_STATES } from "@/lib/constants";
import type { Property, PropertyType } from "@/lib/types/app";
import { PROPERTY_TYPE_VALUES } from "@/lib/validations/property";

type FormValues = {
  name: string;
  property_type: PropertyType;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  year_built: string;
  planned_units: string;
  description: string;
  is_active: boolean;
};

function toFormValues(property: Property | null): FormValues {
  return {
    name: property?.name ?? "",
    property_type: property?.property_type ?? "apartment",
    address_line1: property?.address_line1 ?? "",
    address_line2: property?.address_line2 ?? "",
    city: property?.city ?? "",
    state: property?.state ?? "",
    postal_code: property?.postal_code ?? "",
    country: property?.country ?? "US",
    year_built: property?.year_built != null ? String(property.year_built) : "",
    planned_units:
      property?.planned_units != null ? String(property.planned_units) : "",
    description: property?.description ?? "",
    is_active: property?.is_active ?? true,
  };
}

export function PropertyFormSheet({
  open,
  onOpenChange,
  property,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property | null;
}) {
  const router = useRouter();
  const isEdit = property !== null;
  const [values, setValues] = useState<FormValues>(() =>
    toFormValues(property),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize the form when the sheet opens or switches record.
  // Render-phase reset — React's recommended alternative to an effect.
  const formKey = open ? (property?.id ?? "new") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(toFormValues(property));
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
      const result = property
        ? await updateProperty(property.id, values)
        : await createProperty(values);
      if (result.ok) {
        toast.success(isEdit ? "Property updated" : "Property created");
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
            <SheetTitle>{isEdit ? "Edit property" : "New property"}</SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update the details for this property."
                : "Add a property to your portfolio."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <Field
              label="Property name"
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

            <Field label="Property type" error={errors.property_type}>
              <Select
                value={values.property_type}
                onValueChange={(v) =>
                  set("property_type", (v ?? "apartment") as PropertyType)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPE_VALUES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {PROPERTY_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            <Field
              label="Address line 2"
              htmlFor="address_line2"
              error={errors.address_line2}
            >
              <Input
                id="address_line2"
                value={values.address_line2}
                onChange={(e) => set("address_line2", e.target.value)}
                placeholder="Suite, unit, etc."
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

            <div className="grid grid-cols-2 gap-3">
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
              <Field
                label="Year built"
                htmlFor="year_built"
                error={errors.year_built}
              >
                <Input
                  id="year_built"
                  inputMode="numeric"
                  value={values.year_built}
                  onChange={(e) => set("year_built", e.target.value)}
                  placeholder="e.g. 2015"
                />
              </Field>
            </div>

            <Field
              label="Planned units"
              htmlFor="planned_units"
              hint="Target unit count for this property."
              error={errors.planned_units}
            >
              <Input
                id="planned_units"
                inputMode="numeric"
                value={values.planned_units}
                onChange={(e) => set("planned_units", e.target.value)}
              />
            </Field>

            <Field
              label="Description"
              htmlFor="description"
              error={errors.description}
            >
              <Textarea
                id="description"
                rows={3}
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>

            {isEdit ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={values.is_active}
                  onCheckedChange={(c) => set("is_active", c === true)}
                />
                Active property
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
                  : "Create property"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

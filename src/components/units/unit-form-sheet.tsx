"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createUnit, updateUnit } from "@/app/(app)/units/actions";
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
import { UNIT_STATUS_META } from "@/lib/constants";
import type { Unit, UnitStatus } from "@/lib/types/app";
import { UNIT_STATUS_VALUES } from "@/lib/validations/unit";

type FormValues = {
  property_id: string;
  building_id: string;
  unit_number: string;
  status: UnitStatus;
  floor: string;
  bedrooms: string;
  bathrooms: string;
  square_feet: string;
  market_rent: string;
  is_active: boolean;
};

function toFormValues(unit: Unit | null): FormValues {
  return {
    property_id: unit?.property_id ?? "",
    building_id: unit?.building_id ?? "none",
    unit_number: unit?.unit_number ?? "",
    status: unit?.status ?? "vacant",
    floor: unit?.floor != null ? String(unit.floor) : "",
    bedrooms: unit?.bedrooms != null ? String(unit.bedrooms) : "",
    bathrooms: unit?.bathrooms != null ? String(unit.bathrooms) : "",
    square_feet: unit?.square_feet != null ? String(unit.square_feet) : "",
    market_rent: unit?.market_rent != null ? String(unit.market_rent) : "",
    is_active: unit?.is_active ?? true,
  };
}

export function UnitFormSheet({
  open,
  onOpenChange,
  unit,
  propertyOptions,
  buildingOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: Unit | null;
  propertyOptions: { id: string; name: string }[];
  buildingOptions: { id: string; name: string; property_id: string }[];
}) {
  const router = useRouter();
  const isEdit = unit !== null;
  const [values, setValues] = useState<FormValues>(() => toFormValues(unit));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize the form when the sheet opens or switches record.
  // Render-phase reset — React's recommended alternative to an effect.
  const formKey = open ? (unit?.id ?? "new") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(toFormValues(unit));
      setErrors({});
      setFormError(null);
    }
  }

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const availableBuildings = useMemo(
    () =>
      buildingOptions.filter((b) => b.property_id === values.property_id),
    [buildingOptions, values.property_id],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = unit
        ? await updateUnit(unit.id, values)
        : await createUnit(values);
      if (result.ok) {
        toast.success(isEdit ? "Unit updated" : "Unit created");
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
            <SheetTitle>{isEdit ? "Edit unit" : "New unit"}</SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update the details for this unit."
                : "Add a unit to a property."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <Field label="Property" required error={errors.property_id}>
              <Select
                value={values.property_id}
                onValueChange={(v) => {
                  set("property_id", v ?? "");
                  set("building_id", "none");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {propertyOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Building" error={errors.building_id}>
              <Select
                value={values.building_id}
                onValueChange={(v) => set("building_id", v ?? "none")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No building" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No building</SelectItem>
                  {availableBuildings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Unit number"
              htmlFor="unit_number"
              required
              error={errors.unit_number}
            >
              <Input
                id="unit_number"
                value={values.unit_number}
                onChange={(e) => set("unit_number", e.target.value)}
                required
              />
            </Field>

            <Field label="Status" error={errors.status}>
              <Select
                value={values.status}
                onValueChange={(v) =>
                  set("status", (v ?? "vacant") as UnitStatus)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {UNIT_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Floor" htmlFor="floor" error={errors.floor}>
                <Input
                  id="floor"
                  inputMode="numeric"
                  value={values.floor}
                  onChange={(e) => set("floor", e.target.value)}
                />
              </Field>
              <Field
                label="Square feet"
                htmlFor="square_feet"
                error={errors.square_feet}
              >
                <Input
                  id="square_feet"
                  inputMode="numeric"
                  value={values.square_feet}
                  onChange={(e) => set("square_feet", e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Bedrooms"
                htmlFor="bedrooms"
                error={errors.bedrooms}
              >
                <Input
                  id="bedrooms"
                  inputMode="decimal"
                  value={values.bedrooms}
                  onChange={(e) => set("bedrooms", e.target.value)}
                />
              </Field>
              <Field
                label="Bathrooms"
                htmlFor="bathrooms"
                error={errors.bathrooms}
              >
                <Input
                  id="bathrooms"
                  inputMode="decimal"
                  value={values.bathrooms}
                  onChange={(e) => set("bathrooms", e.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Market rent"
              htmlFor="market_rent"
              error={errors.market_rent}
            >
              <Input
                id="market_rent"
                inputMode="decimal"
                value={values.market_rent}
                onChange={(e) => set("market_rent", e.target.value)}
              />
            </Field>

            {isEdit ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={values.is_active}
                  onCheckedChange={(c) => set("is_active", c === true)}
                />
                Active unit
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
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create unit"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

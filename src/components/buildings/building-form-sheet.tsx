"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createBuilding, updateBuilding } from "@/app/(app)/buildings/actions";
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
import { BUILDING_STATUS_META } from "@/lib/constants";
import type { Building, BuildingStatus } from "@/lib/types/app";
import { BUILDING_STATUS_VALUES } from "@/lib/validations/building";

type FormValues = {
  property_id: string;
  name: string;
  status: BuildingStatus;
  floors: string;
  year_built: string;
  address_line1: string;
  notes: string;
};

function toFormValues(building: Building | null): FormValues {
  return {
    property_id: building?.property_id ?? "",
    name: building?.name ?? "",
    status: building?.status ?? "active",
    floors: building?.floors != null ? String(building.floors) : "",
    year_built: building?.year_built != null ? String(building.year_built) : "",
    address_line1: building?.address_line1 ?? "",
    notes: building?.notes ?? "",
  };
}

export function BuildingFormSheet({
  open,
  onOpenChange,
  building,
  properties,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  building: Building | null;
  properties: { id: string; name: string }[];
}) {
  const router = useRouter();
  const isEdit = building !== null;
  const [values, setValues] = useState<FormValues>(() =>
    toFormValues(building),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize the form when the sheet opens or switches record.
  // Render-phase reset — React's recommended alternative to an effect.
  const formKey = open ? (building?.id ?? "new") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(toFormValues(building));
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
      const result = building
        ? await updateBuilding(building.id, values)
        : await createBuilding(values);
      if (result.ok) {
        toast.success(isEdit ? "Building updated" : "Building created");
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
            <SheetTitle>{isEdit ? "Edit building" : "New building"}</SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update the details for this building."
                : "Add a building to a property."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <Field label="Property" required error={errors.property_id}>
              <Select
                value={values.property_id}
                onValueChange={(v) => set("property_id", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Building name"
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

            <Field label="Status" error={errors.status}>
              <Select
                value={values.status}
                onValueChange={(v) =>
                  set("status", (v ?? "active") as BuildingStatus)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUILDING_STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {BUILDING_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Floors" htmlFor="floors" error={errors.floors}>
                <Input
                  id="floors"
                  inputMode="numeric"
                  value={values.floors}
                  onChange={(e) => set("floors", e.target.value)}
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
                  : "Create building"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

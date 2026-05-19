"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createMaintenanceRequest,
  updateMaintenanceRequest,
} from "@/app/(app)/maintenance/actions";
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
import {
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITY_META,
  MAINTENANCE_STATUS_META,
} from "@/lib/constants";
import type {
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceRequest,
  MaintenanceStatus,
} from "@/lib/types/app";
import {
  MAINTENANCE_CATEGORY_VALUES,
  MAINTENANCE_PRIORITY_VALUES,
  MAINTENANCE_STATUS_VALUES,
} from "@/lib/validations/maintenance-request";

type FormValues = {
  property_id: string;
  unit_id: string;
  tenant_id: string;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  location_notes: string;
  access_instructions: string;
  permission_to_enter: boolean;
};

function toFormValues(request: MaintenanceRequest | null): FormValues {
  return {
    property_id: request?.property_id ?? "",
    unit_id: request?.unit_id ?? "none",
    tenant_id: request?.tenant_id ?? "none",
    title: request?.title ?? "",
    description: request?.description ?? "",
    category: request?.category ?? "general",
    priority: request?.priority ?? "medium",
    status: request?.status ?? "submitted",
    location_notes: request?.location_notes ?? "",
    access_instructions: request?.access_instructions ?? "",
    permission_to_enter: request?.permission_to_enter ?? false,
  };
}

export function MaintenanceRequestFormSheet({
  open,
  onOpenChange,
  request,
  propertyOptions,
  unitOptions,
  tenantOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: MaintenanceRequest | null;
  propertyOptions: { id: string; name: string }[];
  unitOptions: { id: string; unit_number: string; property_id: string }[];
  tenantOptions: {
    id: string;
    first_name: string;
    last_name: string;
    property_id: string | null;
  }[];
}) {
  const router = useRouter();
  const isEdit = request !== null;
  const [values, setValues] = useState<FormValues>(() =>
    toFormValues(request),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize the form when the sheet opens or switches record.
  // Render-phase reset — React's recommended alternative to an effect.
  const formKey = open ? (request?.id ?? "new") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(toFormValues(request));
      setErrors({});
      setFormError(null);
    }
  }

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const filteredUnits = useMemo(
    () =>
      values.property_id === ""
        ? []
        : unitOptions.filter((u) => u.property_id === values.property_id),
    [unitOptions, values.property_id],
  );

  const filteredTenants = useMemo(
    () =>
      values.property_id === ""
        ? tenantOptions
        : tenantOptions.filter(
            (t) =>
              t.property_id === null ||
              t.property_id === values.property_id,
          ),
    [tenantOptions, values.property_id],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = request
        ? await updateMaintenanceRequest(request.id, values)
        : await createMaintenanceRequest(values);
      if (result.ok) {
        toast.success(isEdit ? "Request updated" : "Request created");
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
            <SheetTitle>
              {isEdit ? "Edit request" : "New request"}
            </SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update the details for this maintenance request."
                : "Log a new maintenance request."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <Field label="Property" required error={errors.property_id}>
              <Select
                value={values.property_id}
                onValueChange={(v) => {
                  set("property_id", v ?? "");
                  set("unit_id", "none");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
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

            <Field label="Tenant" error={errors.tenant_id}>
              <Select
                value={values.tenant_id}
                onValueChange={(v) => set("tenant_id", v ?? "none")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No tenant</SelectItem>
                  {filteredTenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.first_name} {t.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Title" htmlFor="title" required error={errors.title}>
              <Input
                id="title"
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Leaking kitchen faucet"
                required
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

            <Field label="Category" error={errors.category}>
              <Select
                value={values.category}
                onValueChange={(v) =>
                  set("category", (v ?? "general") as MaintenanceCategory)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAINTENANCE_CATEGORY_VALUES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {MAINTENANCE_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Priority" error={errors.priority}>
                <Select
                  value={values.priority}
                  onValueChange={(v) =>
                    set("priority", (v ?? "medium") as MaintenancePriority)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_PRIORITY_VALUES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {MAINTENANCE_PRIORITY_META[p].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status" error={errors.status}>
                <Select
                  value={values.status}
                  onValueChange={(v) =>
                    set("status", (v ?? "submitted") as MaintenanceStatus)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_STATUS_VALUES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {MAINTENANCE_STATUS_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field
              label="Location notes"
              htmlFor="location_notes"
              hint="Where in the unit or property is the issue?"
              error={errors.location_notes}
            >
              <Input
                id="location_notes"
                value={values.location_notes}
                onChange={(e) => set("location_notes", e.target.value)}
              />
            </Field>

            <Field
              label="Access instructions"
              htmlFor="access_instructions"
              error={errors.access_instructions}
            >
              <Textarea
                id="access_instructions"
                rows={3}
                value={values.access_instructions}
                onChange={(e) => set("access_instructions", e.target.value)}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values.permission_to_enter}
                onCheckedChange={(c) =>
                  set("permission_to_enter", c === true)
                }
              />
              Permission to enter
            </label>

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
                  : "Create request"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

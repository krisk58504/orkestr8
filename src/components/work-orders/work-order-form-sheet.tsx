"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createWorkOrder,
  updateWorkOrder,
} from "@/app/(app)/work-orders/actions";
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
import {
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITY_META,
  WORK_ORDER_ASSIGNEE_LABELS,
  WORK_ORDER_STATUS_META,
} from "@/lib/constants";
import type {
  MaintenanceCategory,
  MaintenancePriority,
  WorkOrder,
  WorkOrderAssignee,
  WorkOrderStatus,
} from "@/lib/types/app";
import {
  MAINTENANCE_CATEGORY_VALUES,
  MAINTENANCE_PRIORITY_VALUES,
  WORK_ORDER_ASSIGNEE_VALUES,
  WORK_ORDER_STATUS_VALUES,
} from "@/lib/validations/work-order";

export type WorkOrderFormOptions = {
  properties: { id: string; name: string }[];
  units: { id: string; unit_number: string; property_id: string }[];
  vendors: { id: string; name: string }[];
  users: { id: string; full_name: string; email: string }[];
  maintenanceRequests: { id: string; title: string }[];
};

type FormValues = {
  property_id: string;
  unit_id: string;
  maintenance_request_id: string;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: WorkOrderStatus;
  assignee_type: WorkOrderAssignee;
  assigned_vendor_id: string;
  assigned_user_id: string;
  scheduled_for: string;
  sla_due_at: string;
  cost_estimate: string;
  cost_actual: string;
  notes: string;
};

/** Convert a stored ISO timestamp to a datetime-local input value. */
function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return value.slice(0, 16);
}

function toFormValues(workOrder: WorkOrder | null): FormValues {
  return {
    property_id: workOrder?.property_id ?? "",
    unit_id: workOrder?.unit_id ?? "none",
    maintenance_request_id: workOrder?.maintenance_request_id ?? "none",
    title: workOrder?.title ?? "",
    description: workOrder?.description ?? "",
    category: workOrder?.category ?? "general",
    priority: workOrder?.priority ?? "medium",
    status: workOrder?.status ?? "open",
    assignee_type: workOrder?.assignee_type ?? "unassigned",
    assigned_vendor_id: workOrder?.assigned_vendor_id ?? "none",
    assigned_user_id: workOrder?.assigned_user_id ?? "none",
    scheduled_for: toDateTimeLocal(workOrder?.scheduled_for ?? null),
    sla_due_at: toDateTimeLocal(workOrder?.sla_due_at ?? null),
    cost_estimate:
      workOrder?.cost_estimate != null ? String(workOrder.cost_estimate) : "",
    cost_actual:
      workOrder?.cost_actual != null ? String(workOrder.cost_actual) : "",
    notes: workOrder?.notes ?? "",
  };
}

export function WorkOrderFormSheet({
  open,
  onOpenChange,
  workOrder,
  options,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder: WorkOrder | null;
  options: WorkOrderFormOptions;
}) {
  const router = useRouter();
  const isEdit = workOrder !== null;
  const [values, setValues] = useState<FormValues>(() =>
    toFormValues(workOrder),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize the form when the sheet opens or switches record.
  // Render-phase reset — React's recommended alternative to an effect.
  const formKey = open ? (workOrder?.id ?? "new") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(toFormValues(workOrder));
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
        : options.units.filter((u) => u.property_id === values.property_id),
    [options.units, values.property_id],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = workOrder
        ? await updateWorkOrder(workOrder.id, values)
        : await createWorkOrder(values);
      if (result.ok) {
        toast.success(isEdit ? "Work order updated" : "Work order created");
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
              {isEdit ? "Edit work order" : "New work order"}
            </SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update the details for this work order."
                : "Create a work order to track maintenance work."}
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
                  {options.properties.map((p) => (
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
              label="Maintenance request"
              error={errors.maintenance_request_id}
            >
              <Select
                value={values.maintenance_request_id}
                onValueChange={(v) =>
                  set("maintenance_request_id", v ?? "none")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No request</SelectItem>
                  {options.maintenanceRequests.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.title}
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

            <div className="grid grid-cols-2 gap-3">
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
            </div>

            <Field label="Status" error={errors.status}>
              <Select
                value={values.status}
                onValueChange={(v) =>
                  set("status", (v ?? "open") as WorkOrderStatus)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_ORDER_STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {WORK_ORDER_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Assignee" error={errors.assignee_type}>
              <Select
                value={values.assignee_type}
                onValueChange={(v) =>
                  set("assignee_type", (v ?? "unassigned") as WorkOrderAssignee)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_ORDER_ASSIGNEE_VALUES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {WORK_ORDER_ASSIGNEE_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {values.assignee_type === "vendor" ? (
              <Field label="Vendor" error={errors.assigned_vendor_id}>
                <Select
                  value={values.assigned_vendor_id}
                  onValueChange={(v) => set("assigned_vendor_id", v ?? "none")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No vendor</SelectItem>
                    {options.vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            {values.assignee_type === "internal" ? (
              <Field label="Assigned to" error={errors.assigned_user_id}>
                <Select
                  value={values.assigned_user_id}
                  onValueChange={(v) => set("assigned_user_id", v ?? "none")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No assignee</SelectItem>
                    {options.users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Scheduled for"
                htmlFor="scheduled_for"
                error={errors.scheduled_for}
              >
                <Input
                  id="scheduled_for"
                  type="datetime-local"
                  value={values.scheduled_for}
                  onChange={(e) => set("scheduled_for", e.target.value)}
                />
              </Field>
              <Field
                label="SLA due"
                htmlFor="sla_due_at"
                error={errors.sla_due_at}
              >
                <Input
                  id="sla_due_at"
                  type="datetime-local"
                  value={values.sla_due_at}
                  onChange={(e) => set("sla_due_at", e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Cost estimate"
                htmlFor="cost_estimate"
                error={errors.cost_estimate}
              >
                <Input
                  id="cost_estimate"
                  inputMode="decimal"
                  value={values.cost_estimate}
                  onChange={(e) => set("cost_estimate", e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field
                label="Actual cost"
                htmlFor="cost_actual"
                error={errors.cost_actual}
              >
                <Input
                  id="cost_actual"
                  inputMode="decimal"
                  value={values.cost_actual}
                  onChange={(e) => set("cost_actual", e.target.value)}
                  placeholder="0.00"
                />
              </Field>
            </div>

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
                  : "Create work order"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

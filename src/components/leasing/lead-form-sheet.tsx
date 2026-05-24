"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createLead, updateLead } from "@/app/(app)/leasing/actions";
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
import { LEAD_SOURCE_META, LEAD_STATUS_META } from "@/lib/constants";
import type { Lead, LeadSource, LeadStatus } from "@/lib/types/app";
import {
  LEAD_SOURCE_VALUES,
  LEAD_STATUS_VALUES,
} from "@/lib/validations/lead";

type FormValues = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: LeadStatus;
  source: LeadSource;
  assigned_to: string;
  desired_property_id: string;
  desired_move_in: string;
  desired_bedrooms: string;
  desired_budget: string;
  notes: string;
};

function toFormValues(lead: Lead | null): FormValues {
  return {
    first_name: lead?.first_name ?? "",
    last_name: lead?.last_name ?? "",
    email: lead?.email ?? "",
    phone: lead?.phone ?? "",
    status: lead?.status ?? "new",
    source: lead?.source ?? "other",
    assigned_to: lead?.assigned_to ?? "none",
    desired_property_id: lead?.desired_property_id ?? "none",
    desired_move_in: lead?.desired_move_in ?? "",
    desired_bedrooms:
      lead?.desired_bedrooms != null ? String(lead.desired_bedrooms) : "",
    desired_budget:
      lead?.desired_budget != null ? String(lead.desired_budget) : "",
    notes: lead?.notes ?? "",
  };
}

export function LeadFormSheet({
  open,
  onOpenChange,
  lead,
  propertyOptions,
  assigneeOptions,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  propertyOptions: { id: string; name: string }[];
  assigneeOptions: { id: string; full_name: string | null; email: string }[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const isEdit = lead !== null;
  const [values, setValues] = useState<FormValues>(() => toFormValues(lead));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize when the sheet opens or switches record.
  // Render-phase reset — React's recommended alternative to an effect.
  const formKey = open ? (lead?.id ?? "new") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(toFormValues(lead));
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
      const result = lead
        ? await updateLead(lead.id, values)
        : await createLead(values);
      if (result.ok) {
        toast.success(isEdit ? "Lead updated" : "Lead created");
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
            <SheetTitle>{isEdit ? "Edit lead" : "New lead"}</SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update prospect details and move them through the pipeline."
                : "Capture a new prospect for the Leasing pipeline."}
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
                  set("status", (v ?? "new") as LeadStatus)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Source" error={errors.source}>
              <Select
                value={values.source}
                onValueChange={(v) =>
                  set("source", (v ?? "other") as LeadSource)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCE_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_SOURCE_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Assigned to" error={errors.assigned_to}>
              <Select
                value={values.assigned_to}
                onValueChange={(v) => set("assigned_to", v ?? "none")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {assigneeOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name?.trim() || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Desired property" error={errors.desired_property_id}>
              <Select
                value={values.desired_property_id}
                onValueChange={(v) =>
                  set("desired_property_id", v ?? "none")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No preference</SelectItem>
                  {propertyOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Desired move-in"
              htmlFor="desired_move_in"
              error={errors.desired_move_in}
            >
              <Input
                id="desired_move_in"
                type="date"
                value={values.desired_move_in}
                onChange={(e) => set("desired_move_in", e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Desired bedrooms"
                htmlFor="desired_bedrooms"
                error={errors.desired_bedrooms}
              >
                <Input
                  id="desired_bedrooms"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={values.desired_bedrooms}
                  onChange={(e) => set("desired_bedrooms", e.target.value)}
                />
              </Field>
              <Field
                label="Desired budget"
                htmlFor="desired_budget"
                error={errors.desired_budget}
              >
                <Input
                  id="desired_budget"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={values.desired_budget}
                  onChange={(e) => set("desired_budget", e.target.value)}
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
                  : "Create lead"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

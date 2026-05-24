"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createApplication,
  updateApplication,
} from "@/app/(app)/applications/actions";
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
import { APPLICATION_STATUS_META } from "@/lib/constants";
import type { Application, ApplicationStatus } from "@/lib/types/app";
import { APPLICATION_STATUS_VALUES } from "@/lib/validations/application";

type FormValues = {
  lead_id: string;
  unit_id: string;
  status: ApplicationStatus;
  applicant_first_name: string;
  applicant_last_name: string;
  applicant_email: string;
  applicant_phone: string;
  desired_move_in: string;
  monthly_income: string;
  employment_status: string;
  prior_address: string;
  background_check_consent: boolean;
};

function toFormValues(app: Application | null): FormValues {
  return {
    lead_id: app?.lead_id ?? "none",
    unit_id: app?.unit_id ?? "",
    status: app?.status ?? "draft",
    applicant_first_name: app?.applicant_first_name ?? "",
    applicant_last_name: app?.applicant_last_name ?? "",
    applicant_email: app?.applicant_email ?? "",
    applicant_phone: app?.applicant_phone ?? "",
    desired_move_in: app?.desired_move_in ?? "",
    monthly_income:
      app?.monthly_income != null ? String(app.monthly_income) : "",
    employment_status: app?.employment_status ?? "",
    prior_address: app?.prior_address ?? "",
    background_check_consent: app?.background_check_consent ?? false,
  };
}

export function ApplicationFormSheet({
  open,
  onOpenChange,
  application,
  unitOptions,
  leadOptions,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: Application | null;
  unitOptions: { id: string; unit_number: string }[];
  leadOptions: { id: string; first_name: string; last_name: string }[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const isEdit = application !== null;
  const [values, setValues] = useState<FormValues>(() =>
    toFormValues(application),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize when the sheet opens or switches record. Render-phase reset.
  const formKey = open ? (application?.id ?? "new") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(toFormValues(application));
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
      const result = application
        ? await updateApplication(application.id, values)
        : await createApplication(values);
      if (result.ok) {
        toast.success(isEdit ? "Application updated" : "Application created");
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
              {isEdit ? "Edit application" : "New application"}
            </SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update applicant details and workflow status."
                : "Capture an application to lease a specific unit."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <Field label="Unit" required error={errors.unit_id}>
              <Select
                value={values.unit_id}
                onValueChange={(v) => set("unit_id", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a unit" />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.unit_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Lead" error={errors.lead_id}>
              <Select
                value={values.lead_id}
                onValueChange={(v) => set("lead_id", v ?? "none")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Walk-in (no prior lead)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Walk-in (no prior lead)</SelectItem>
                  {leadOptions.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.first_name} {l.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Applicant first name"
                htmlFor="applicant_first_name"
                required
                error={errors.applicant_first_name}
              >
                <Input
                  id="applicant_first_name"
                  value={values.applicant_first_name}
                  onChange={(e) =>
                    set("applicant_first_name", e.target.value)
                  }
                  required
                />
              </Field>
              <Field
                label="Applicant last name"
                htmlFor="applicant_last_name"
                required
                error={errors.applicant_last_name}
              >
                <Input
                  id="applicant_last_name"
                  value={values.applicant_last_name}
                  onChange={(e) =>
                    set("applicant_last_name", e.target.value)
                  }
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Applicant email"
                htmlFor="applicant_email"
                required
                error={errors.applicant_email}
              >
                <Input
                  id="applicant_email"
                  type="email"
                  value={values.applicant_email}
                  onChange={(e) => set("applicant_email", e.target.value)}
                  required
                />
              </Field>
              <Field
                label="Applicant phone"
                htmlFor="applicant_phone"
                error={errors.applicant_phone}
              >
                <Input
                  id="applicant_phone"
                  value={values.applicant_phone}
                  onChange={(e) => set("applicant_phone", e.target.value)}
                />
              </Field>
            </div>

            <Field label="Status" error={errors.status}>
              <Select
                value={values.status}
                onValueChange={(v) =>
                  set("status", (v ?? "draft") as ApplicationStatus)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPLICATION_STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {APPLICATION_STATUS_META[s].label}
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
                label="Monthly income"
                htmlFor="monthly_income"
                error={errors.monthly_income}
              >
                <Input
                  id="monthly_income"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={values.monthly_income}
                  onChange={(e) => set("monthly_income", e.target.value)}
                />
              </Field>
              <Field
                label="Employment status"
                htmlFor="employment_status"
                hint="e.g. Employed, Self-employed, Student"
                error={errors.employment_status}
              >
                <Input
                  id="employment_status"
                  value={values.employment_status}
                  onChange={(e) => set("employment_status", e.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Prior address"
              htmlFor="prior_address"
              error={errors.prior_address}
            >
              <Textarea
                id="prior_address"
                rows={2}
                value={values.prior_address}
                onChange={(e) => set("prior_address", e.target.value)}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values.background_check_consent}
                onCheckedChange={(c) =>
                  set("background_check_consent", c === true)
                }
              />
              Applicant has consented to a background check
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
                  : "Create application"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

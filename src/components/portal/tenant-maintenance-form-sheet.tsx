"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  submitMaintenanceRequest,
  type TenantMaintenanceInput,
} from "@/app/portal/maintenance/actions";
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
import { MAINTENANCE_CATEGORY_LABELS } from "@/lib/constants";
import type { MaintenanceCategory } from "@/lib/types/app";
import { MAINTENANCE_CATEGORY_VALUES } from "@/lib/validations/maintenance-request";

type FormValues = {
  title: string;
  category: MaintenanceCategory;
  description: string;
};

function emptyValues(): FormValues {
  return { title: "", category: "general", description: "" };
}

export function TenantMaintenanceFormSheet({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const [values, setValues] = useState<FormValues>(() => emptyValues());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize when the sheet opens. Render-phase reset.
  const formKey = open ? "open" : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(emptyValues());
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
      const payload: TenantMaintenanceInput = {
        title: values.title,
        category: values.category,
        description: values.description,
      };
      const result = await submitMaintenanceRequest(payload);
      if (result.ok) {
        toast.success("Request submitted");
        onOpenChange(false);
        onSuccess?.();
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
            <SheetTitle>New maintenance request</SheetTitle>
            <SheetDescription>
              Tell your property team what needs attention. They'll review and
              get back to you.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <Field
              label="Title"
              htmlFor="title"
              required
              error={errors.title}
              hint="A short summary, e.g. 'Leaking kitchen faucet'"
            >
              <Input
                id="title"
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                maxLength={160}
                required
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

            <Field
              label="Description"
              htmlFor="description"
              error={errors.description}
              hint="Details that help diagnose or schedule the work."
            >
              <Textarea
                id="description"
                rows={5}
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                maxLength={2000}
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
              {pending ? "Submitting…" : "Submit request"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

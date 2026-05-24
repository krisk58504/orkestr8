"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { scheduleTour, updateTour } from "@/app/(app)/leasing/tour-actions";
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
import { TOUR_STATUS_META } from "@/lib/constants";
import type { Tour, TourStatus } from "@/lib/types/app";
import { TOUR_STATUS_VALUES } from "@/lib/validations/tour";

type FormValues = {
  unit_id: string;
  agent_id: string;
  scheduled_at: string;
  status: TourStatus;
  outcome_notes: string;
};

/**
 * `<input type="datetime-local">` requires "YYYY-MM-DDTHH:mm" (no seconds,
 * no timezone). DB timestamptz comes back as ISO with both — slice off
 * seconds and timezone for the input. Same trip in reverse: the DB parses
 * the no-tz value in the connection timezone.
 */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  // ISO from Postgres is e.g. "2026-06-01T14:30:00+00:00"
  // Strip after the minute portion.
  const match = iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function toFormValues(tour: Tour | null): FormValues {
  return {
    unit_id: tour?.unit_id ?? "none",
    agent_id: tour?.agent_id ?? "none",
    scheduled_at: toDatetimeLocal(tour?.scheduled_at ?? null),
    status: tour?.status ?? "scheduled",
    outcome_notes: tour?.outcome_notes ?? "",
  };
}

export function TourFormSheet({
  open,
  onOpenChange,
  leadId,
  tour,
  unitOptions,
  agentOptions,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  tour: Tour | null;
  unitOptions: { id: string; unit_number: string }[];
  agentOptions: { id: string; full_name: string | null; email: string }[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const isEdit = tour !== null;
  const [values, setValues] = useState<FormValues>(() => toFormValues(tour));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize when the sheet opens or switches record. Render-phase reset.
  const formKey = open ? (tour?.id ?? "new") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(toFormValues(tour));
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
      const payload = {
        lead_id: leadId,
        unit_id: values.unit_id,
        agent_id: values.agent_id,
        scheduled_at: values.scheduled_at,
        status: values.status,
        outcome_notes: values.outcome_notes,
      };
      const result = tour
        ? await updateTour(tour.id, payload)
        : await scheduleTour(payload);
      if (result.ok) {
        toast.success(isEdit ? "Tour updated" : "Tour scheduled");
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
            <SheetTitle>{isEdit ? "Edit tour" : "Schedule tour"}</SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update the details for this tour."
                : "Schedule a tour for this prospect."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <Field
              label="Scheduled at"
              htmlFor="scheduled_at"
              required
              error={errors.scheduled_at}
            >
              <Input
                id="scheduled_at"
                type="datetime-local"
                value={values.scheduled_at}
                onChange={(e) => set("scheduled_at", e.target.value)}
                required
              />
            </Field>

            <Field label="Unit" error={errors.unit_id}>
              <Select
                value={values.unit_id}
                onValueChange={(v) => set("unit_id", v ?? "none")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any unit</SelectItem>
                  {unitOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.unit_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Agent" error={errors.agent_id}>
              <Select
                value={values.agent_id}
                onValueChange={(v) => set("agent_id", v ?? "none")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {agentOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name?.trim() || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Status" error={errors.status}>
              <Select
                value={values.status}
                onValueChange={(v) =>
                  set("status", (v ?? "scheduled") as TourStatus)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOUR_STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {TOUR_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Outcome notes"
              htmlFor="outcome_notes"
              hint="Filled after the tour — observations, follow-ups, decisions."
              error={errors.outcome_notes}
            >
              <Textarea
                id="outcome_notes"
                rows={4}
                value={values.outcome_notes}
                onChange={(e) => set("outcome_notes", e.target.value)}
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
                  : "Schedule tour"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

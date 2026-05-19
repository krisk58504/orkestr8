"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createVendorRating } from "@/app/(app)/vendors/actions";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const RATING_VALUES = ["1", "2", "3", "4", "5"] as const;

type FormValues = {
  rating: string;
  review: string;
};

function emptyValues(): FormValues {
  return { rating: "5", review: "" };
}

export function VendorRatingDialog({
  open,
  onOpenChange,
  vendorId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(() => emptyValues());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize the form when the dialog opens.
  // Render-phase reset — React's recommended alternative to an effect.
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
      const result = await createVendorRating({
        vendor_id: vendorId,
        rating: Number(values.rating),
        review: values.review,
      });
      if (result.ok) {
        toast.success("Rating added");
        onOpenChange(false);
        router.refresh();
      } else {
        setFormError(result.error);
        setErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add rating</DialogTitle>
            <DialogDescription>
              Rate this vendor on a scale of 1 to 5.
            </DialogDescription>
          </DialogHeader>

          <Field label="Rating" required error={errors.rating}>
            <Select
              value={values.rating}
              onValueChange={(v) => set("rating", v ?? "5")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATING_VALUES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r} {Number(r) === 1 ? "star" : "stars"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Review" htmlFor="review" error={errors.review}>
            <Textarea
              id="review"
              rows={3}
              value={values.review}
              onChange={(e) => set("review", e.target.value)}
              placeholder="Optional notes about this vendor's work."
            />
          </Field>

          {formError ? (
            <p className="text-sm text-destructive">{formError}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add rating"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

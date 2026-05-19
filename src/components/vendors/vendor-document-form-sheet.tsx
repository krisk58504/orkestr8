"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createVendorDocument,
  updateVendorDocument,
} from "@/app/(app)/vendors/actions";
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
import { VENDOR_DOCUMENT_TYPE_LABELS } from "@/lib/constants";
import type { VendorDocument, VendorDocumentType } from "@/lib/types/app";
import { VENDOR_DOCUMENT_TYPE_VALUES } from "@/lib/validations/vendor";

type FormValues = {
  document_type: VendorDocumentType;
  name: string;
  issued_on: string;
  expires_on: string;
  notes: string;
};

function toFormValues(document: VendorDocument | null): FormValues {
  return {
    document_type: document?.document_type ?? "other",
    name: document?.name ?? "",
    issued_on: document?.issued_on ?? "",
    expires_on: document?.expires_on ?? "",
    notes: document?.notes ?? "",
  };
}

export function VendorDocumentFormSheet({
  open,
  onOpenChange,
  vendorId,
  document,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  document: VendorDocument | null;
}) {
  const router = useRouter();
  const isEdit = document !== null;
  const [values, setValues] = useState<FormValues>(() =>
    toFormValues(document),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize the form when the sheet opens or switches record.
  // Render-phase reset — React's recommended alternative to an effect.
  const formKey = open ? (document?.id ?? "new") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(toFormValues(document));
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
      const input = { ...values, vendor_id: vendorId };
      const result = document
        ? await updateVendorDocument(document.id, input)
        : await createVendorDocument(input);
      if (result.ok) {
        toast.success(isEdit ? "Document updated" : "Document added");
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
              {isEdit ? "Edit document" : "New document"}
            </SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update the details for this document."
                : "Record a document for this vendor."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <Field label="Document type" error={errors.document_type}>
              <Select
                value={values.document_type}
                onValueChange={(v) =>
                  set("document_type", (v ?? "other") as VendorDocumentType)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_DOCUMENT_TYPE_VALUES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {VENDOR_DOCUMENT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Document name"
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

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Issued on"
                htmlFor="issued_on"
                error={errors.issued_on}
              >
                <Input
                  id="issued_on"
                  type="date"
                  value={values.issued_on}
                  onChange={(e) => set("issued_on", e.target.value)}
                />
              </Field>
              <Field
                label="Expires on"
                htmlFor="expires_on"
                error={errors.expires_on}
              >
                <Input
                  id="expires_on"
                  type="date"
                  value={values.expires_on}
                  onChange={(e) => set("expires_on", e.target.value)}
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
                  : "Add document"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

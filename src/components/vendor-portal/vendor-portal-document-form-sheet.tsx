"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createVendorDocument } from "@/app/vendor-portal/actions";
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
import type { VendorDocumentType } from "@/lib/types/app";
import {
  VENDOR_PORTAL_DOCUMENT_TYPE_VALUES,
  type VendorPortalDocumentInput,
} from "@/lib/validations/vendor-portal";

type FormValues = {
  document_type: VendorDocumentType;
  name: string;
  issued_on: string;
  expires_on: string;
  notes: string;
};

const EMPTY_VALUES: FormValues = {
  document_type: "other",
  name: "",
  issued_on: "",
  expires_on: "",
  notes: "",
};

export function VendorPortalDocumentFormSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Render-phase reset — React's recommended alternative to an effect.
  // This sheet only ever creates new documents, so the key is open-state only.
  const formKey = open ? "new" : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(EMPTY_VALUES);
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
      const input: VendorPortalDocumentInput = {
        document_type: values.document_type,
        name: values.name,
        issued_on: values.issued_on,
        expires_on: values.expires_on,
        notes: values.notes,
      };
      const result = await createVendorDocument(input);
      if (result.ok) {
        toast.success("Document added");
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
            <SheetTitle>New document</SheetTitle>
            <SheetDescription>
              Record a compliance document for your company.
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
                  {VENDOR_PORTAL_DOCUMENT_TYPE_VALUES.map((t) => (
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
              {pending ? "Saving…" : "Add document"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

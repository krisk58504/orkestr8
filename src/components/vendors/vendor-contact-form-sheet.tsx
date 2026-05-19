"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createVendorContact,
  updateVendorContact,
} from "@/app/(app)/vendors/actions";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { VendorContact } from "@/lib/types/app";

type FormValues = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  title: string;
  is_primary: boolean;
};

function toFormValues(contact: VendorContact | null): FormValues {
  return {
    first_name: contact?.first_name ?? "",
    last_name: contact?.last_name ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    title: contact?.title ?? "",
    is_primary: contact?.is_primary ?? false,
  };
}

export function VendorContactFormSheet({
  open,
  onOpenChange,
  vendorId,
  contact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  contact: VendorContact | null;
}) {
  const router = useRouter();
  const isEdit = contact !== null;
  const [values, setValues] = useState<FormValues>(() =>
    toFormValues(contact),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize the form when the sheet opens or switches record.
  // Render-phase reset — React's recommended alternative to an effect.
  const formKey = open ? (contact?.id ?? "new") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(toFormValues(contact));
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
      const result = contact
        ? await updateVendorContact(contact.id, input)
        : await createVendorContact(input);
      if (result.ok) {
        toast.success(isEdit ? "Contact updated" : "Contact added");
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
            <SheetTitle>{isEdit ? "Edit contact" : "New contact"}</SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update the details for this contact."
                : "Add a contact for this vendor."}
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

            <Field label="Title" htmlFor="title" error={errors.title}>
              <Input
                id="title"
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Account Manager"
              />
            </Field>

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

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values.is_primary}
                onCheckedChange={(c) => set("is_primary", c === true)}
              />
              Primary contact
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
                  : "Add contact"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

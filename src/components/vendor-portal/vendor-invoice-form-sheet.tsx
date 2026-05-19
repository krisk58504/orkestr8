"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createVendorInvoice,
  updateVendorInvoice,
} from "@/app/vendor-portal/actions";
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
import { VENDOR_INVOICE_STATUS_META } from "@/lib/constants";
import type { VendorInvoice } from "@/lib/types/app";
import {
  VENDOR_PORTAL_INVOICE_STATUS_VALUES,
  type VendorInvoiceInput,
} from "@/lib/validations/vendor-portal";

/** Work orders the vendor can attach an invoice to. */
export type InvoiceWorkOrderOption = { id: string; label: string };

type InvoiceStatus = (typeof VENDOR_PORTAL_INVOICE_STATUS_VALUES)[number];

type FormValues = {
  invoice_number: string;
  amount: string;
  status: InvoiceStatus;
  work_order_id: string;
  issued_on: string;
  due_on: string;
  notes: string;
};

function toFormValues(invoice: VendorInvoice | null): FormValues {
  // A vendor can only edit draft/submitted invoices; clamp anything else.
  const status: InvoiceStatus =
    invoice?.status === "draft" ? "draft" : "submitted";
  return {
    invoice_number: invoice?.invoice_number ?? "",
    amount: invoice?.amount != null ? String(invoice.amount) : "",
    status,
    work_order_id: invoice?.work_order_id ?? "none",
    issued_on: invoice?.issued_on ?? "",
    due_on: invoice?.due_on ?? "",
    notes: invoice?.notes ?? "",
  };
}

export function VendorInvoiceFormSheet({
  open,
  onOpenChange,
  invoice,
  workOrders,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: VendorInvoice | null;
  workOrders: InvoiceWorkOrderOption[];
}) {
  const router = useRouter();
  const isEdit = invoice !== null;
  const [values, setValues] = useState<FormValues>(() =>
    toFormValues(invoice),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Render-phase reset — React's recommended alternative to an effect.
  const formKey = open ? (invoice?.id ?? "new") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setValues(toFormValues(invoice));
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
      const input: VendorInvoiceInput = {
        invoice_number: values.invoice_number,
        amount: values.amount,
        status: values.status,
        work_order_id: values.work_order_id,
        issued_on: values.issued_on,
        due_on: values.due_on,
        notes: values.notes,
      };
      const result = invoice
        ? await updateVendorInvoice(invoice.id, input)
        : await createVendorInvoice(input);
      if (result.ok) {
        toast.success(isEdit ? "Invoice updated" : "Invoice submitted");
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
            <SheetTitle>{isEdit ? "Edit invoice" : "Submit invoice"}</SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update the details for this invoice."
                : "Submit an invoice for work completed for the property-management team."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <Field
              label="Invoice number"
              htmlFor="invoice_number"
              error={errors.invoice_number}
              hint="Optional."
            >
              <Input
                id="invoice_number"
                value={values.invoice_number}
                onChange={(e) => set("invoice_number", e.target.value)}
              />
            </Field>

            <Field
              label="Amount"
              htmlFor="amount"
              required
              error={errors.amount}
            >
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={values.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="0.00"
                required
              />
            </Field>

            <Field label="Status" error={errors.status}>
              <Select
                value={values.status}
                onValueChange={(v) =>
                  set("status", (v ?? "submitted") as InvoiceStatus)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_PORTAL_INVOICE_STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {VENDOR_INVOICE_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Related work order" error={errors.work_order_id}>
              <Select
                value={values.work_order_id}
                onValueChange={(v) => set("work_order_id", v ?? "none")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No work order</SelectItem>
                  {workOrders.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Field label="Due on" htmlFor="due_on" error={errors.due_on}>
                <Input
                  id="due_on"
                  type="date"
                  value={values.due_on}
                  onChange={(e) => set("due_on", e.target.value)}
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
                  : "Submit invoice"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

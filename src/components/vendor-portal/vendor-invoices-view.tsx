"use client";

import { useState } from "react";
import { FileText, Pencil, Plus } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VENDOR_INVOICE_STATUS_META } from "@/lib/constants";
import type { VendorInvoice } from "@/lib/types/app";
import {
  VendorInvoiceFormSheet,
  type InvoiceWorkOrderOption,
} from "./vendor-invoice-form-sheet";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function formatAmount(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** A vendor may only edit invoices still in draft/submitted status. */
function isEditable(invoice: VendorInvoice): boolean {
  return invoice.status === "draft" || invoice.status === "submitted";
}

export function VendorInvoicesView({
  invoices,
  workOrders,
}: {
  invoices: VendorInvoice[];
  workOrders: InvoiceWorkOrderOption[];
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<VendorInvoice | null>(null);

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(invoice: VendorInvoice) {
    setEditing(invoice);
    setSheetOpen(true);
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus className="size-4" />
          Submit invoice
        </Button>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description="Submit an invoice for work completed for the property-management team."
          action={
            <Button onClick={openNew}>
              <Plus className="size-4" />
              Submit invoice
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => {
                const meta = VENDOR_INVOICE_STATUS_META[invoice.status];
                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.invoice_number ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatAmount(invoice.amount)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(invoice.issued_on)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(invoice.due_on)}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditable(invoice) ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit invoice"
                          onClick={() => openEdit(invoice)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <VendorInvoiceFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        invoice={editing}
        workOrders={workOrders}
      />
    </>
  );
}

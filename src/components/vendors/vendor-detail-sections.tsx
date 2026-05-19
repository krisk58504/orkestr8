"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteVendorContact,
  deleteVendorDocument,
  deleteVendorRating,
} from "@/app/(app)/vendors/actions";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  VENDOR_DOCUMENT_TYPE_LABELS,
  VENDOR_INVOICE_STATUS_META,
} from "@/lib/constants";
import type { Tone } from "@/lib/constants";
import type {
  VendorContact,
  VendorDocument,
  VendorInvoice,
  VendorRating,
} from "@/lib/types/app";
import { VendorContactFormSheet } from "./vendor-contact-form-sheet";
import { VendorDocumentFormSheet } from "./vendor-document-form-sheet";
import { VendorRatingDialog } from "./vendor-rating-dialog";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

type DeleteTarget = {
  kind: "contact" | "document" | "rating";
  id: string;
  label: string;
};

function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit?: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <MoreHorizontal className="size-4" />
        <span className="sr-only">Open actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onEdit ? (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function complianceBadge(expiresOn: string | null): React.ReactNode {
  if (!expiresOn) {
    return <StatusBadge tone="neutral">No expiry</StatusBadge>;
  }
  const expiry = new Date(expiresOn);
  if (Number.isNaN(expiry.getTime())) {
    return <StatusBadge tone="neutral">No expiry</StatusBadge>;
  }
  const now = new Date();
  const days = Math.ceil(
    (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  let tone: Tone = "success";
  let label = "Valid";
  if (days < 0) {
    tone = "danger";
    label = "Expired";
  } else if (days <= 30) {
    tone = "warning";
    label = "Expiring soon";
  }
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={
            n <= rating
              ? "size-4 fill-amber-400 text-amber-400"
              : "size-4 text-muted-foreground/30"
          }
        />
      ))}
    </span>
  );
}

export function VendorDetailSections({
  vendorId,
  contacts,
  documents,
  invoices,
  ratings,
  canManage,
}: {
  vendorId: string;
  contacts: VendorContact[];
  documents: VendorDocument[];
  invoices: VendorInvoice[];
  ratings: VendorRating[];
  canManage: boolean;
}) {
  const router = useRouter();

  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<VendorContact | null>(
    null,
  );

  const [documentSheetOpen, setDocumentSheetOpen] = useState(false);
  const [editingDocument, setEditingDocument] =
    useState<VendorDocument | null>(null);

  const [ratingDialogOpen, setRatingDialogOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  function openNewContact() {
    setEditingContact(null);
    setContactSheetOpen(true);
  }
  function openEditContact(contact: VendorContact) {
    setEditingContact(contact);
    setContactSheetOpen(true);
  }
  function openNewDocument() {
    setEditingDocument(null);
    setDocumentSheetOpen(true);
  }
  function openEditDocument(document: VendorDocument) {
    setEditingDocument(document);
    setDocumentSheetOpen(true);
  }

  async function handleConfirmDelete() {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;

    const result =
      target.kind === "contact"
        ? await deleteVendorContact(target.id, vendorId)
        : target.kind === "document"
          ? await deleteVendorDocument(target.id, vendorId)
          : await deleteVendorRating(target.id, vendorId);

    if (result.ok) {
      toast.success(
        target.kind === "contact"
          ? "Contact deleted"
          : target.kind === "document"
            ? "Document deleted"
            : "Rating deleted",
      );
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Contacts</CardTitle>
            <CardDescription>People at this vendor company</CardDescription>
          </div>
          {canManage ? (
            <Button size="sm" onClick={openNewContact}>
              <Plus className="size-4" />
              Add contact
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No contacts recorded for this vendor.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  {canManage ? (
                    <TableHead className="w-12 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">
                      {contact.first_name} {contact.last_name}
                      {contact.is_primary ? (
                        <StatusBadge tone="info">Primary</StatusBadge>
                      ) : null}
                    </TableCell>
                    <TableCell>{contact.title || "—"}</TableCell>
                    <TableCell>{contact.email || "—"}</TableCell>
                    <TableCell>{contact.phone || "—"}</TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        <RowActions
                          onEdit={() => openEditContact(contact)}
                          onDelete={() =>
                            setDeleteTarget({
                              kind: "contact",
                              id: contact.id,
                              label: `${contact.first_name} ${contact.last_name}`,
                            })
                          }
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              Insurance, licenses, and other compliance records
            </CardDescription>
          </div>
          {canManage ? (
            <Button size="sm" onClick={openNewDocument}>
              <Plus className="size-4" />
              Add document
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No documents recorded for this vendor.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Compliance</TableHead>
                  {canManage ? (
                    <TableHead className="w-12 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="font-medium">
                      {document.name}
                    </TableCell>
                    <TableCell>
                      {VENDOR_DOCUMENT_TYPE_LABELS[document.document_type]}
                    </TableCell>
                    <TableCell>{formatDate(document.issued_on)}</TableCell>
                    <TableCell>{formatDate(document.expires_on)}</TableCell>
                    <TableCell>
                      {complianceBadge(document.expires_on)}
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        <RowActions
                          onEdit={() => openEditDocument(document)}
                          onDelete={() =>
                            setDeleteTarget({
                              kind: "document",
                              id: document.id,
                              label: document.name,
                            })
                          }
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Ratings</CardTitle>
            <CardDescription>Performance reviews for this vendor</CardDescription>
          </div>
          {canManage ? (
            <Button size="sm" onClick={() => setRatingDialogOpen(true)}>
              <Plus className="size-4" />
              Add rating
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {ratings.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No ratings recorded for this vendor.
            </p>
          ) : (
            <ul className="space-y-3">
              {ratings.map((rating) => (
                <li
                  key={rating.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="space-y-1">
                    <Stars rating={rating.rating} />
                    {rating.review ? (
                      <p className="text-sm whitespace-pre-wrap">
                        {rating.review}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {formatDate(rating.created_at)}
                    </p>
                  </div>
                  {canManage ? (
                    <RowActions
                      onDelete={() =>
                        setDeleteTarget({
                          kind: "rating",
                          id: rating.id,
                          label: `${rating.rating}-star rating`,
                        })
                      }
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>
            Invoices submitted by this vendor
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No invoices recorded for this vendor.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  const meta = VENDOR_INVOICE_STATUS_META[invoice.status];
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        {invoice.invoice_number || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={meta.tone}>
                          {meta.label}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>{formatDate(invoice.issued_on)}</TableCell>
                      <TableCell>{formatDate(invoice.due_on)}</TableCell>
                      <TableCell>{formatDate(invoice.paid_on)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(invoice.amount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <>
          <VendorContactFormSheet
            open={contactSheetOpen}
            onOpenChange={setContactSheetOpen}
            vendorId={vendorId}
            contact={editingContact}
          />
          <VendorDocumentFormSheet
            open={documentSheetOpen}
            onOpenChange={setDocumentSheetOpen}
            vendorId={vendorId}
            document={editingDocument}
          />
          <VendorRatingDialog
            open={ratingDialogOpen}
            onOpenChange={setRatingDialogOpen}
            vendorId={vendorId}
          />
          <AlertDialog
            open={deleteTarget !== null}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this record?</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteTarget
                    ? `"${deleteTarget.label}" will be permanently removed. This cannot be undone.`
                    : "This record will be permanently removed. This cannot be undone."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={handleConfirmDelete}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </>
  );
}

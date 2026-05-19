"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Folder, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteVendorDocument } from "@/app/vendor-portal/actions";
import { EmptyState } from "@/components/shared/empty-state";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VENDOR_DOCUMENT_TYPE_LABELS } from "@/lib/constants";
import type { VendorDocument } from "@/lib/types/app";
import { VendorPortalDocumentFormSheet } from "./vendor-portal-document-form-sheet";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

/** Returns an "Expired" / "Expiring soon" badge for a document, or null. */
function expiryBadge(expiresOn: string | null) {
  if (!expiresOn) return null;
  const expires = new Date(expiresOn);
  if (Number.isNaN(expires.getTime())) return null;
  const now = new Date();
  if (expires < now) {
    return <StatusBadge tone="danger">Expired</StatusBadge>;
  }
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 30);
  if (expires <= horizon) {
    return <StatusBadge tone="warning">Expiring soon</StatusBadge>;
  }
  return null;
}

export function VendorDocumentsView({
  documents,
}: {
  documents: VendorDocument[];
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VendorDocument | null>(null);
  const [pendingDelete, startDelete] = useTransition();

  function handleConfirmDelete() {
    const target = deleteTarget;
    if (!target) return;
    startDelete(async () => {
      const result = await deleteVendorDocument(target.id);
      if (result.ok) {
        toast.success("Document deleted");
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="size-4" />
          Add document
        </Button>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={Folder}
          title="No documents yet"
          description="Add insurance, licenses, and other compliance documents for your company."
          action={
            <Button onClick={() => setSheetOpen(true)}>
              <Plus className="size-4" />
              Add document
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                  <TableCell className="text-muted-foreground">
                    {formatDate(document.issued_on)}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {formatDate(document.expires_on)}
                      {expiryBadge(document.expires_on)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Delete document"
                      onClick={() => setDeleteTarget(document)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <VendorPortalDocumentFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.name}" will be permanently removed. This cannot be undone.`
                : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pendingDelete}
              onClick={handleConfirmDelete}
            >
              {pendingDelete ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

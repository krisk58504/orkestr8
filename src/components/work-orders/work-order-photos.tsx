"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageOff, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  deleteWorkOrderPhoto,
  recordWorkOrderPhoto,
  requestWorkOrderPhotoUpload,
} from "@/app/(app)/work-orders/photo-actions";
import { Field } from "@/components/shared/field";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WORK_ORDER_PHOTO_BUCKET } from "@/lib/constants";
import type { WorkOrderPhotoWithUrl } from "@/lib/data/work-order-photos";
import { createClient } from "@/lib/supabase/client";

const PHOTO_KINDS = [
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
  { value: "general", label: "General" },
] as const;

const KIND_LABELS: Record<string, string> = {
  before: "Before",
  after: "After",
  general: "General",
};

const MAX_BYTES = 10 * 1024 * 1024;

export function WorkOrderPhotos({
  workOrderId,
  photos,
  canManage,
}: {
  workOrderId: string;
  photos: WorkOrderPhotoWithUrl[];
  canManage: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<string>("before");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [pendingDelete, startDelete] = useTransition();

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose a photo to upload.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Photo must be 10 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const ticket = await requestWorkOrderPhotoUpload(workOrderId, file.name);
      if (!ticket.ok) {
        toast.error(ticket.error);
        return;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(WORK_ORDER_PHOTO_BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.token, file);
      if (uploadError) {
        toast.error(uploadError.message);
        return;
      }

      const recorded = await recordWorkOrderPhoto(
        workOrderId,
        ticket.path,
        caption,
        kind,
      );
      if (!recorded.ok) {
        toast.error(recorded.error);
        return;
      }

      toast.success("Photo uploaded");
      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not upload the photo.",
      );
    } finally {
      setUploading(false);
    }
  }

  function handleConfirmDelete() {
    const photoId = deleteTarget;
    if (!photoId) return;
    startDelete(async () => {
      const result = await deleteWorkOrderPhoto(photoId);
      if (result.ok) {
        toast.success("Photo deleted");
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {canManage ? (
        <form
          onSubmit={handleUpload}
          className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
        >
          <Field label="Photo" htmlFor="photo-file" required>
            <Input
              id="photo-file"
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic"
              disabled={uploading}
            />
          </Field>
          <Field label="Type">
            <Select
              value={kind}
              onValueChange={(v) => setKind(v ?? "before")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PHOTO_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Caption" htmlFor="photo-caption" hint="Optional.">
            <Input
              id="photo-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={200}
              placeholder="Describe the photo"
              disabled={uploading}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={uploading}>
              <Upload className="size-4" />
              {uploading ? "Uploading…" : "Upload photo"}
            </Button>
          </div>
        </form>
      ) : null}

      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No photos have been added to this work order yet.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="overflow-hidden rounded-lg border"
            >
              <div className="relative aspect-video bg-muted">
                {photo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.url}
                    alt={photo.caption ?? "Work order photo"}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageOff className="size-6" />
                  </div>
                )}
              </div>
              <div className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {KIND_LABELS[photo.kind] ?? "General"}
                  </p>
                  {photo.caption ? (
                    <p className="text-sm">{photo.caption}</p>
                  ) : null}
                </div>
                {canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Delete photo"
                    onClick={() => setDeleteTarget(photo.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              The photo will be permanently removed. This cannot be undone.
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
    </div>
  );
}

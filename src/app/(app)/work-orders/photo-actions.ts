"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { WORK_ORDER_PHOTO_BUCKET } from "@/lib/constants";
import { logAudit } from "@/lib/data/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PHOTO_KINDS = ["before", "after", "general"];

export type UploadTicket =
  | { ok: true; path: string; token: string }
  | { ok: false; error: string };

export type PhotoResult = { ok: true } | { ok: false; error: string };

/**
 * Authorize a photo upload and return a signed upload URL.
 *
 * Access is gated by RLS: the work order is only visible (org staff, or the
 * assigned vendor) if the caller is allowed to attach photos to it. The signed
 * upload URL itself is minted with the service-role client.
 */
export async function requestWorkOrderPhotoUpload(
  workOrderId: string,
  fileName: string,
): Promise<UploadTicket> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };

  const supabase = await createClient();
  const { data: workOrder } = await supabase
    .from("work_orders")
    .select("id, organization_id")
    .eq("id", workOrderId)
    .maybeSingle();
  if (!workOrder) {
    return { ok: false, error: "Work order not found or not accessible." };
  }

  const safeName = (fileName || "photo").replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-80);
  const path = `${workOrder.organization_id}/${workOrderId}/${randomUUID()}-${safeName}`;

  const { data, error } = await createAdminClient()
    .storage.from(WORK_ORDER_PHOTO_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not start the upload." };
  }
  return { ok: true, path: data.path, token: data.token };
}

/** Record an uploaded photo. Insert is RLS-checked (staff or assigned vendor). */
export async function recordWorkOrderPhoto(
  workOrderId: string,
  filePath: string,
  caption: string,
  kind: string,
): Promise<PhotoResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };

  const supabase = await createClient();
  const { data: workOrder } = await supabase
    .from("work_orders")
    .select("id, organization_id")
    .eq("id", workOrderId)
    .maybeSingle();
  if (!workOrder) {
    return { ok: false, error: "Work order not found or not accessible." };
  }

  const { error } = await supabase.from("work_order_photos").insert({
    organization_id: workOrder.organization_id,
    work_order_id: workOrderId,
    file_path: filePath,
    caption: caption.trim() ? caption.trim() : null,
    kind: PHOTO_KINDS.includes(kind) ? kind : "general",
    uploaded_by: guard.context.authUserId,
  });
  if (error) {
    // Roll back the orphaned storage object.
    try {
      await createAdminClient()
        .storage.from(WORK_ORDER_PHOTO_BUCKET)
        .remove([filePath]);
    } catch {
      // best-effort
    }
    return { ok: false, error: error.message };
  }

  await logAudit({
    organizationId: workOrder.organization_id,
    actorId: guard.context.authUserId,
    action: "work_order_photo.added",
    entityType: "work_order",
    entityId: workOrderId,
  });
  revalidatePath(`/work-orders/${workOrderId}`);
  revalidatePath(`/vendor-portal/work-orders/${workOrderId}`);
  return { ok: true };
}

export async function deleteWorkOrderPhoto(photoId: string): Promise<PhotoResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };

  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("work_order_photos")
    .select("id, file_path, work_order_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) {
    return { ok: false, error: "Photo not found or not accessible." };
  }

  const { error } = await supabase
    .from("work_order_photos")
    .delete()
    .eq("id", photoId);
  if (error) return { ok: false, error: error.message };

  try {
    await createAdminClient()
      .storage.from(WORK_ORDER_PHOTO_BUCKET)
      .remove([photo.file_path]);
  } catch {
    // best-effort — the row is already gone
  }
  revalidatePath(`/work-orders/${photo.work_order_id}`);
  revalidatePath(`/vendor-portal/work-orders/${photo.work_order_id}`);
  return { ok: true };
}

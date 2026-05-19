import "server-only";
import { WORK_ORDER_PHOTO_BUCKET } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { WorkOrderPhoto } from "@/lib/types/app";

export type WorkOrderPhotoWithUrl = WorkOrderPhoto & { url: string | null };

/**
 * Photos for a work order, each with a short-lived signed download URL.
 *
 * The rows are read through the RLS-scoped client, so the caller is already
 * authorized for every row returned. Signed URLs are then minted with the
 * service-role client (Storage is private and server-mediated).
 */
export async function listWorkOrderPhotos(
  orgId: string,
  workOrderId: string,
): Promise<WorkOrderPhotoWithUrl[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("work_order_photos")
    .select("*")
    .eq("organization_id", orgId)
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: false });

  const photos = data ?? [];
  if (photos.length === 0) return [];

  const admin = createAdminClient();
  const { data: signed } = await admin.storage
    .from(WORK_ORDER_PHOTO_BUCKET)
    .createSignedUrls(
      photos.map((p) => p.file_path),
      3600,
    );

  const urlByPath = new Map<string, string>();
  for (const entry of signed ?? []) {
    if (entry.path && entry.signedUrl) urlByPath.set(entry.path, entry.signedUrl);
  }

  return photos.map((p) => ({ ...p, url: urlByPath.get(p.file_path) ?? null }));
}

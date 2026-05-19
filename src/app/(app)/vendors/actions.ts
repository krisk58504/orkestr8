"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { isManager } from "@/lib/auth/roles";
import { logAudit } from "@/lib/data/audit";
import { createClient } from "@/lib/supabase/server";
import { collectFieldErrors } from "@/lib/validations/shared";
import {
  vendorContactInputSchema,
  vendorDocumentInputSchema,
  vendorInputSchema,
  vendorRatingInputSchema,
  type VendorContactInput,
  type VendorDocumentInput,
  type VendorInput,
  type VendorRatingInput,
} from "@/lib/validations/vendor";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NO_PERMISSION = "You don't have permission to manage vendors.";

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------
export async function createVendor(input: VendorInput): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = vendorInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendors")
    .insert({
      organization_id: guard.context.organization.id,
      name: parsed.data.name,
      trade: parsed.data.trade,
      status: parsed.data.status,
      email: parsed.data.email,
      phone: parsed.data.phone,
      website: parsed.data.website,
      address_line1: parsed.data.address_line1,
      city: parsed.data.city,
      state: parsed.data.state,
      postal_code: parsed.data.postal_code,
      notes: parsed.data.notes,
      is_active: parsed.data.is_active,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "vendor.created",
    entityType: "vendor",
    entityId: data.id,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/vendors");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateVendor(
  id: string,
  input: VendorInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = vendorInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({
      name: parsed.data.name,
      trade: parsed.data.trade,
      status: parsed.data.status,
      email: parsed.data.email,
      phone: parsed.data.phone,
      website: parsed.data.website,
      address_line1: parsed.data.address_line1,
      city: parsed.data.city,
      state: parsed.data.state,
      postal_code: parsed.data.postal_code,
      notes: parsed.data.notes,
      is_active: parsed.data.is_active,
    })
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "vendor.updated",
    entityType: "vendor",
    entityId: id,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteVendor(id: string): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .delete()
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "vendor.deleted",
    entityType: "vendor",
    entityId: id,
  });

  revalidatePath("/vendors");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Vendor contacts
// ---------------------------------------------------------------------------
export async function createVendorContact(
  input: VendorContactInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = vendorContactInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_contacts")
    .insert({
      organization_id: guard.context.organization.id,
      vendor_id: parsed.data.vendor_id,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      title: parsed.data.title,
      is_primary: parsed.data.is_primary,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "vendor_contact.created",
    entityType: "vendor_contact",
    entityId: data.id,
    metadata: {
      vendor_id: parsed.data.vendor_id,
      name: `${parsed.data.first_name} ${parsed.data.last_name}`,
    },
  });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${parsed.data.vendor_id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateVendorContact(
  id: string,
  input: VendorContactInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = vendorContactInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendor_contacts")
    .update({
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      title: parsed.data.title,
      is_primary: parsed.data.is_primary,
    })
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "vendor_contact.updated",
    entityType: "vendor_contact",
    entityId: id,
    metadata: {
      vendor_id: parsed.data.vendor_id,
      name: `${parsed.data.first_name} ${parsed.data.last_name}`,
    },
  });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${parsed.data.vendor_id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteVendorContact(
  id: string,
  vendorId: string,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendor_contacts")
    .delete()
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "vendor_contact.deleted",
    entityType: "vendor_contact",
    entityId: id,
    metadata: { vendor_id: vendorId },
  });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Vendor documents
// ---------------------------------------------------------------------------
export async function createVendorDocument(
  input: VendorDocumentInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = vendorDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_documents")
    .insert({
      organization_id: guard.context.organization.id,
      vendor_id: parsed.data.vendor_id,
      document_type: parsed.data.document_type,
      name: parsed.data.name,
      file_path: null,
      issued_on: parsed.data.issued_on,
      expires_on: parsed.data.expires_on,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "vendor_document.created",
    entityType: "vendor_document",
    entityId: data.id,
    metadata: { vendor_id: parsed.data.vendor_id, name: parsed.data.name },
  });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${parsed.data.vendor_id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateVendorDocument(
  id: string,
  input: VendorDocumentInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = vendorDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendor_documents")
    .update({
      document_type: parsed.data.document_type,
      name: parsed.data.name,
      issued_on: parsed.data.issued_on,
      expires_on: parsed.data.expires_on,
      notes: parsed.data.notes,
    })
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "vendor_document.updated",
    entityType: "vendor_document",
    entityId: id,
    metadata: { vendor_id: parsed.data.vendor_id, name: parsed.data.name },
  });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${parsed.data.vendor_id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteVendorDocument(
  id: string,
  vendorId: string,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendor_documents")
    .delete()
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "vendor_document.deleted",
    entityType: "vendor_document",
    entityId: id,
    metadata: { vendor_id: vendorId },
  });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Vendor ratings
// ---------------------------------------------------------------------------
export async function createVendorRating(
  input: VendorRatingInput,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const parsed = vendorRatingInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_ratings")
    .insert({
      organization_id: guard.context.organization.id,
      vendor_id: parsed.data.vendor_id,
      rating: parsed.data.rating,
      review: parsed.data.review,
      rated_by: guard.context.authUserId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "vendor_rating.created",
    entityType: "vendor_rating",
    entityId: data.id,
    metadata: { vendor_id: parsed.data.vendor_id, rating: parsed.data.rating },
  });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${parsed.data.vendor_id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteVendorRating(
  id: string,
  vendorId: string,
): Promise<ActionResult> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isManager(guard.context.roles)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendor_ratings")
    .delete()
    .eq("id", id)
    .eq("organization_id", guard.context.organization.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: guard.context.organization.id,
    actorId: guard.context.authUserId,
    action: "vendor_rating.deleted",
    entityType: "vendor_rating",
    entityId: id,
    metadata: { vendor_id: vendorId },
  });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

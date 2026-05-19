"use server";

/**
 * actions.ts — vendor-portal server actions.
 *
 * Every action requires a signed-in session that is a vendor-portal user
 * (VENDOR_ADMIN / VENDOR_TECH) with a non-null vendorId. RLS is the
 * authoritative enforcement layer; these checks add friendly errors and
 * defense-in-depth. Status-transition rules a vendor must not cross
 * (cancel, reassign, mark-paid) are enforced here, not in RLS.
 */

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { isVendorUser } from "@/lib/auth/roles";
import type { SessionContext } from "@/lib/types/app";
import { logAudit } from "@/lib/data/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { collectFieldErrors } from "@/lib/validations/shared";
import {
  vendorInvoiceInputSchema,
  vendorPortalDocumentInputSchema,
  type VendorInvoiceInput,
  type VendorPortalDocumentInput,
} from "@/lib/validations/vendor-portal";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NOT_VENDOR =
  "This action is only available to vendor-portal accounts linked to a vendor company.";

type VendorGuard = { context: SessionContext; vendorId: string };

/** requireSession + vendor-user + non-null vendorId, collapsed into one check. */
async function requireVendor(): Promise<
  { ok: true; guard: VendorGuard } | { ok: false; error: string }
> {
  const guard = await requireSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isVendorUser(guard.context.roles) || !guard.context.vendorId) {
    return { ok: false, error: NOT_VENDOR };
  }
  return {
    ok: true,
    guard: { context: guard.context, vendorId: guard.context.vendorId },
  };
}

/**
 * The managing organization that owns a vendor's records. A vendor-portal
 * user's own `organization_id` is NOT necessarily the managing org, so the
 * vendor row's `organization_id` is the safe source for inserts.
 */
async function getVendorOrganizationId(
  vendorId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vendors")
    .select("organization_id")
    .eq("id", vendorId)
    .maybeSingle();
  return data?.organization_id ?? null;
}

// ---------------------------------------------------------------------------
// Work orders
// ---------------------------------------------------------------------------

/**
 * Accept an assigned work order: assigned -> accepted.
 * Verifies the work order is currently assigned to the caller's vendor.
 */
export async function acceptWorkOrder(id: string): Promise<ActionResult> {
  const v = await requireVendor();
  if (!v.ok) return { ok: false, error: v.error };
  const { context, vendorId } = v.guard;

  const supabase = await createClient();
  const { data: workOrder } = await supabase
    .from("work_orders")
    .select("id, status, assigned_vendor_id, organization_id")
    .eq("id", id)
    .maybeSingle();

  if (!workOrder || workOrder.assigned_vendor_id !== vendorId) {
    return { ok: false, error: "Work order not found or not assigned to you." };
  }
  if (workOrder.status !== "assigned") {
    return {
      ok: false,
      error: "Only an assigned work order can be accepted.",
    };
  }

  const { error } = await supabase
    .from("work_orders")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("assigned_vendor_id", vendorId);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: workOrder.organization_id,
    actorId: context.authUserId,
    action: "work_order.accepted",
    entityType: "work_order",
    entityId: id,
    metadata: { vendor_id: vendorId },
  });

  revalidatePath("/vendor-portal");
  revalidatePath("/vendor-portal/work-orders");
  revalidatePath(`/vendor-portal/work-orders/${id}`);
  return { ok: true };
}

/**
 * Decline an assigned work order: returns it to the staff queue so it can be
 * reassigned (status -> new, assigned_vendor_id -> null, assignee_type ->
 * unassigned). Clearing assigned_vendor_id would fail the vendor branch of the
 * RLS WITH CHECK (the row no longer matches the vendor), so the update is run
 * with the admin client AFTER ownership is verified with the RLS client.
 */
export async function declineWorkOrder(id: string): Promise<ActionResult> {
  const v = await requireVendor();
  if (!v.ok) return { ok: false, error: v.error };
  const { context, vendorId } = v.guard;

  const supabase = await createClient();
  const { data: workOrder } = await supabase
    .from("work_orders")
    .select("id, status, assigned_vendor_id, organization_id")
    .eq("id", id)
    .maybeSingle();

  if (!workOrder || workOrder.assigned_vendor_id !== vendorId) {
    return { ok: false, error: "Work order not found or not assigned to you." };
  }
  if (workOrder.status !== "assigned") {
    return {
      ok: false,
      error: "Only an assigned work order can be declined.",
    };
  }

  // Ownership confirmed above — release the job with the admin client.
  const admin = createAdminClient();
  const { error } = await admin
    .from("work_orders")
    .update({
      status: "open",
      assigned_vendor_id: null,
      assignee_type: "unassigned",
      accepted_at: null,
    })
    .eq("id", id)
    .eq("assigned_vendor_id", vendorId);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: workOrder.organization_id,
    actorId: context.authUserId,
    action: "work_order.declined",
    entityType: "work_order",
    entityId: id,
    metadata: { vendor_id: vendorId },
  });

  revalidatePath("/vendor-portal");
  revalidatePath("/vendor-portal/work-orders");
  revalidatePath(`/vendor-portal/work-orders/${id}`);
  revalidatePath("/work-orders");
  return { ok: true };
}

/** Status transitions a vendor is permitted to perform via this action. */
const VENDOR_STATUS_TRANSITIONS: Record<string, string[]> = {
  accepted: ["in_progress", "completed"],
  in_progress: ["completed"],
};

/**
 * Advance a work order's status. Only `in_progress` and `completed` are valid
 * targets, and only from a current status that permits the transition. A
 * vendor can never set `cancelled`, reassign the vendor, or change the org.
 */
export async function updateWorkOrderStatus(
  id: string,
  status: string,
  extra: { notes?: string; costActual?: string } = {},
): Promise<ActionResult> {
  const v = await requireVendor();
  if (!v.ok) return { ok: false, error: v.error };
  const { context, vendorId } = v.guard;

  if (status !== "in_progress" && status !== "completed") {
    return {
      ok: false,
      error: "You can only move a job to In Progress or Completed.",
    };
  }

  const supabase = await createClient();
  const { data: workOrder } = await supabase
    .from("work_orders")
    .select("id, status, assigned_vendor_id, organization_id, notes, cost_actual")
    .eq("id", id)
    .maybeSingle();

  if (!workOrder || workOrder.assigned_vendor_id !== vendorId) {
    return { ok: false, error: "Work order not found or not assigned to you." };
  }

  const allowed = VENDOR_STATUS_TRANSITIONS[workOrder.status] ?? [];
  if (!allowed.includes(status)) {
    return {
      ok: false,
      error: `A job that is "${workOrder.status}" cannot be moved to "${status}".`,
    };
  }

  const update: {
    status: "in_progress" | "completed";
    completed_at?: string;
    notes?: string | null;
    cost_actual?: number;
  } = { status };

  if (status === "completed") {
    update.completed_at = new Date().toISOString();

    const trimmedNotes = extra.notes?.trim();
    if (trimmedNotes) {
      if (trimmedNotes.length > 2000) {
        return {
          ok: false,
          error: "Completion notes must be 2000 characters or fewer.",
          fieldErrors: { notes: "Must be 2000 characters or fewer." },
        };
      }
      update.notes = trimmedNotes;
    }

    const rawCost = extra.costActual?.trim();
    if (rawCost) {
      const cost = Number(rawCost);
      if (!Number.isFinite(cost) || cost < 0 || cost > 100_000_000) {
        return {
          ok: false,
          error: "Enter a valid actual cost.",
          fieldErrors: { costActual: "Enter a valid amount." },
        };
      }
      update.cost_actual = cost;
    }
  }

  const { error } = await supabase
    .from("work_orders")
    .update(update)
    .eq("id", id)
    .eq("assigned_vendor_id", vendorId);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: workOrder.organization_id,
    actorId: context.authUserId,
    action: "work_order.status_changed",
    entityType: "work_order",
    entityId: id,
    metadata: { vendor_id: vendorId, from: workOrder.status, to: status },
  });

  revalidatePath("/vendor-portal");
  revalidatePath("/vendor-portal/work-orders");
  revalidatePath(`/vendor-portal/work-orders/${id}`);
  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function createVendorInvoice(
  input: VendorInvoiceInput,
): Promise<ActionResult> {
  const v = await requireVendor();
  if (!v.ok) return { ok: false, error: v.error };
  const { context, vendorId } = v.guard;

  const parsed = vendorInvoiceInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const organizationId = await getVendorOrganizationId(vendorId);
  if (!organizationId) {
    return { ok: false, error: "Could not resolve your vendor company." };
  }

  // If a work order is linked, confirm it belongs to this vendor.
  if (parsed.data.work_order_id) {
    const supabase = await createClient();
    const { data: workOrder } = await supabase
      .from("work_orders")
      .select("id")
      .eq("id", parsed.data.work_order_id)
      .eq("assigned_vendor_id", vendorId)
      .maybeSingle();
    if (!workOrder) {
      return {
        ok: false,
        error: "The linked work order is not assigned to you.",
        fieldErrors: { work_order_id: "Not one of your work orders." },
      };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_invoices")
    .insert({
      organization_id: organizationId,
      vendor_id: vendorId,
      work_order_id: parsed.data.work_order_id,
      invoice_number: parsed.data.invoice_number,
      amount: parsed.data.amount ?? 0,
      // Vendors may only submit/draft — never approved/paid/rejected.
      status: parsed.data.status,
      issued_on: parsed.data.issued_on,
      due_on: parsed.data.due_on,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId,
    actorId: context.authUserId,
    action: "vendor_invoice.created",
    entityType: "vendor_invoice",
    entityId: data.id,
    metadata: { vendor_id: vendorId, status: parsed.data.status },
  });

  revalidatePath("/vendor-portal");
  revalidatePath("/vendor-portal/invoices");
  return { ok: true };
}

export async function updateVendorInvoice(
  id: string,
  input: VendorInvoiceInput,
): Promise<ActionResult> {
  const v = await requireVendor();
  if (!v.ok) return { ok: false, error: v.error };
  const { context, vendorId } = v.guard;

  const parsed = vendorInvoiceInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("vendor_invoices")
    .select("id, status, vendor_id")
    .eq("id", id)
    .eq("vendor_id", vendorId)
    .maybeSingle();

  if (!existing) {
    return { ok: false, error: "Invoice not found or not yours." };
  }
  // A vendor may only edit an invoice still in draft/submitted. Once staff
  // have approved/rejected/paid it, it is read-only to the vendor.
  if (existing.status !== "draft" && existing.status !== "submitted") {
    return {
      ok: false,
      error: "This invoice has been processed and can no longer be edited.",
    };
  }

  if (parsed.data.work_order_id) {
    const { data: workOrder } = await supabase
      .from("work_orders")
      .select("id")
      .eq("id", parsed.data.work_order_id)
      .eq("assigned_vendor_id", vendorId)
      .maybeSingle();
    if (!workOrder) {
      return {
        ok: false,
        error: "The linked work order is not assigned to you.",
        fieldErrors: { work_order_id: "Not one of your work orders." },
      };
    }
  }

  const { error } = await supabase
    .from("vendor_invoices")
    .update({
      work_order_id: parsed.data.work_order_id,
      invoice_number: parsed.data.invoice_number,
      amount: parsed.data.amount ?? 0,
      // Clamp to vendor-permitted statuses — never approved/paid/rejected.
      status: parsed.data.status,
      issued_on: parsed.data.issued_on,
      due_on: parsed.data.due_on,
      notes: parsed.data.notes,
    })
    .eq("id", id)
    .eq("vendor_id", vendorId);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: context.organization.id,
    actorId: context.authUserId,
    action: "vendor_invoice.updated",
    entityType: "vendor_invoice",
    entityId: id,
    metadata: { vendor_id: vendorId, status: parsed.data.status },
  });

  revalidatePath("/vendor-portal");
  revalidatePath("/vendor-portal/invoices");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function createVendorDocument(
  input: VendorPortalDocumentInput,
): Promise<ActionResult> {
  const v = await requireVendor();
  if (!v.ok) return { ok: false, error: v.error };
  const { context, vendorId } = v.guard;

  const parsed = vendorPortalDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const organizationId = await getVendorOrganizationId(vendorId);
  if (!organizationId) {
    return { ok: false, error: "Could not resolve your vendor company." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_documents")
    .insert({
      organization_id: organizationId,
      vendor_id: vendorId,
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
    organizationId,
    actorId: context.authUserId,
    action: "vendor_document.created",
    entityType: "vendor_document",
    entityId: data.id,
    metadata: { vendor_id: vendorId, name: parsed.data.name },
  });

  revalidatePath("/vendor-portal");
  revalidatePath("/vendor-portal/documents");
  return { ok: true };
}

export async function deleteVendorDocument(id: string): Promise<ActionResult> {
  const v = await requireVendor();
  if (!v.ok) return { ok: false, error: v.error };
  const { context, vendorId } = v.guard;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("vendor_documents")
    .select("id, organization_id, name")
    .eq("id", id)
    .eq("vendor_id", vendorId)
    .maybeSingle();

  if (!existing) {
    return { ok: false, error: "Document not found or not yours." };
  }

  const { error } = await supabase
    .from("vendor_documents")
    .delete()
    .eq("id", id)
    .eq("vendor_id", vendorId);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    organizationId: existing.organization_id,
    actorId: context.authUserId,
    action: "vendor_document.deleted",
    entityType: "vendor_document",
    entityId: id,
    metadata: { vendor_id: vendorId, name: existing.name },
  });

  revalidatePath("/vendor-portal");
  revalidatePath("/vendor-portal/documents");
  return { ok: true };
}

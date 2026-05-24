/**
 * app.ts — application-facing type aliases derived from the DB schema.
 */
import type { Database } from "./database";

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];

export type Organization = Tables<"organizations">;
export type AppUser = Tables<"users">;
export type UserRoleRow = Tables<"user_roles">;
export type Setting = Tables<"settings">;
export type Property = Tables<"properties">;
export type Building = Tables<"buildings">;
export type Unit = Tables<"units">;
export type Tenant = Tables<"tenants">;
export type TenantInvite = Tables<"tenant_invites">;
export type AuditLog = Tables<"audit_logs">;
export type Notification = Tables<"notifications">;
export type AiLog = Tables<"ai_logs">;
export type AutomationLog = Tables<"automation_logs">;
export type Vendor = Tables<"vendors">;
export type VendorContact = Tables<"vendor_contacts">;
export type VendorDocument = Tables<"vendor_documents">;
export type VendorInvoice = Tables<"vendor_invoices">;
export type VendorRating = Tables<"vendor_ratings">;
export type MaintenanceRequest = Tables<"maintenance_requests">;
export type WorkOrder = Tables<"work_orders">;
export type WorkOrderPhoto = Tables<"work_order_photos">;
export type EmailLog = Tables<"email_log">;
export type Lease = Tables<"leases">;

export type UserRole = Enums<"user_role">;
export type AiMode = Enums<"ai_mode">;
export type EmailMode = Enums<"email_mode">;
export type OrganizationStatus = Enums<"organization_status">;
export type PropertyType = Enums<"property_type">;
export type BuildingStatus = Enums<"building_status">;
export type UnitStatus = Enums<"unit_status">;
export type TenantStatus = Enums<"tenant_status">;
/**
 * Derived portal-access state for a tenant — not a DB enum. Computed from
 * tenant.user_id + their most recent tenant_invites row in listTenants().
 */
export type TenantInviteStatus =
  | "accepted"
  | "pending"
  | "expired"
  | "revoked"
  | "none";

/**
 * Tenant-facing maintenance status — not a DB enum. Collapses the 7 internal
 * maintenance_status values into 5 user-friendly states for the tenant
 * portal. See toTenantMaintenanceStatus() in lib/constants.ts.
 */
export type TenantMaintenanceStatus =
  | "submitted"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";
export type MaintenanceStatus = Enums<"maintenance_status">;
export type MaintenancePriority = Enums<"maintenance_priority">;
export type MaintenanceCategory = Enums<"maintenance_category">;
export type WorkOrderStatus = Enums<"work_order_status">;
export type WorkOrderAssignee = Enums<"work_order_assignee">;
export type VendorStatus = Enums<"vendor_status">;
export type VendorDocumentType = Enums<"vendor_document_type">;
export type VendorInvoiceStatus = Enums<"vendor_invoice_status">;
export type LeaseStatus = Enums<"lease_status">;

/** Resolved identity for the signed-in user, loaded once per request. */
export type SessionContext = {
  authUserId: string;
  email: string;
  profile: AppUser;
  organization: Organization;
  roles: UserRole[];
  /** Set when the user belongs to a vendor company (vendor-portal user). */
  vendorId: string | null;
};

/** A property row enriched with aggregate counts for list/detail views. */
export type PropertyWithStats = Property & {
  unit_count: number;
  occupied_count: number;
  building_count: number;
};

export type UnitWithRelations = Unit & {
  property: Pick<Property, "id" | "name"> | null;
  building: Pick<Building, "id" | "name"> | null;
};

export type TenantWithRelations = Tenant & {
  property: Pick<Property, "id" | "name"> | null;
  unit: Pick<Unit, "id" | "unit_number"> | null;
};

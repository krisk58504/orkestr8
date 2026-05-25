/**
 * constants.ts — static reference data: role definitions, enum labels, and
 * display metadata. Pure data only (no React) so it is safe on server or
 * client.
 */
import type {
  AiMode,
  ApplicationStatus,
  BuildingStatus,
  LeadSource,
  LeadStatus,
  LeaseStatus,
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
  OrganizationStatus,
  PaymentMethod,
  PropertyType,
  RentChargeStatus,
  RentChargeType,
  TenantInviteStatus,
  TenantMaintenanceStatus,
  TenantStatus,
  TourStatus,
  UnitStatus,
  UserRole,
  VendorDocumentType,
  VendorInvoiceStatus,
  VendorStatus,
  WorkOrderAssignee,
  WorkOrderStatus,
} from "./types/app";

/** Visual tone keys mapped to Badge styling by statusBadgeClass(). */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
export const ALL_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "OWNER",
  "REGIONAL_MANAGER",
  "PROPERTY_MANAGER",
  "LEASING_AGENT",
  "MAINTENANCE_MANAGER",
  "MAINTENANCE_TECH",
  "VENDOR_ADMIN",
  "VENDOR_TECH",
  "TENANT",
  "INVESTOR",
  "ACCOUNTING",
];

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  OWNER: "Owner",
  REGIONAL_MANAGER: "Regional Manager",
  PROPERTY_MANAGER: "Property Manager",
  LEASING_AGENT: "Leasing Agent",
  MAINTENANCE_MANAGER: "Maintenance Manager",
  MAINTENANCE_TECH: "Maintenance Tech",
  VENDOR_ADMIN: "Vendor Admin",
  VENDOR_TECH: "Vendor Tech",
  TENANT: "Tenant",
  INVESTOR: "Investor",
  ACCOUNTING: "Accounting",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  SUPER_ADMIN: "Platform-level access across all organizations.",
  OWNER: "Full control of the organization, billing, and team.",
  REGIONAL_MANAGER: "Manages a portfolio of properties.",
  PROPERTY_MANAGER: "Day-to-day management of assigned properties.",
  LEASING_AGENT: "Handles leads, tours, applications, and tenants.",
  MAINTENANCE_MANAGER: "Oversees maintenance requests and work orders.",
  MAINTENANCE_TECH: "Completes assigned maintenance work.",
  VENDOR_ADMIN: "External vendor company administrator.",
  VENDOR_TECH: "External vendor technician.",
  TENANT: "Resident with tenant-portal access only.",
  INVESTOR: "Owner/investor with portfolio reporting access.",
  ACCOUNTING: "Financial records and reporting.",
};

/** Internal staff — may read management data within their organization. */
export const STAFF_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "OWNER",
  "REGIONAL_MANAGER",
  "PROPERTY_MANAGER",
  "LEASING_AGENT",
  "MAINTENANCE_MANAGER",
  "MAINTENANCE_TECH",
  "ACCOUNTING",
];

/** Management roles — may create/edit properties, buildings, units, tenants. */
export const MANAGEMENT_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "OWNER",
  "REGIONAL_MANAGER",
  "PROPERTY_MANAGER",
];

/** Roles allowed to maintain tenant records. */
export const TENANT_WRITE_ROLES: UserRole[] = [
  ...MANAGEMENT_ROLES,
  "LEASING_AGENT",
];

/** Roles an Owner may assign from the app. SUPER_ADMIN is never assignable. */
export const ASSIGNABLE_ROLES: UserRole[] = ALL_ROLES.filter(
  (r) => r !== "SUPER_ADMIN",
);

// ---------------------------------------------------------------------------
// AI modes (SPEC Gate 2)
// ---------------------------------------------------------------------------
export const AI_MODE_LABELS: Record<AiMode, string> = {
  disabled: "Disabled",
  draft_only: "Draft only",
  suggest_only: "Suggest only",
  auto_with_approval: "Auto with approval",
  fully_automated: "Fully automated",
};

/** AI modes that may take real action without per-action human approval. */
export const AI_MODES_REQUIRING_REVIEW: AiMode[] = [
  "auto_with_approval",
  "fully_automated",
];

// ---------------------------------------------------------------------------
// Enum display metadata
// ---------------------------------------------------------------------------
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: "Apartment",
  condo: "Condo",
  townhome: "Townhome",
  single_family: "Single Family",
  duplex: "Duplex",
  mixed_use: "Mixed Use",
  commercial: "Commercial",
  other: "Other",
};

export const UNIT_STATUS_META: Record<UnitStatus, { label: string; tone: Tone }> = {
  vacant: { label: "Vacant", tone: "warning" },
  occupied: { label: "Occupied", tone: "success" },
  notice: { label: "On Notice", tone: "info" },
  make_ready: { label: "Make Ready", tone: "info" },
  off_market: { label: "Off Market", tone: "neutral" },
  model: { label: "Model", tone: "neutral" },
  down: { label: "Down", tone: "danger" },
};

export const TENANT_STATUS_META: Record<TenantStatus, { label: string; tone: Tone }> = {
  prospect: { label: "Prospect", tone: "neutral" },
  applicant: { label: "Applicant", tone: "info" },
  current: { label: "Current", tone: "success" },
  notice: { label: "On Notice", tone: "warning" },
  past: { label: "Past", tone: "neutral" },
  evicted: { label: "Evicted", tone: "danger" },
};

export const PORTAL_ACCESS_META: Record<
  TenantInviteStatus,
  { label: string; tone: Tone }
> = {
  accepted: { label: "Active", tone: "success" },
  pending: { label: "Invite pending", tone: "info" },
  expired: { label: "Invite expired", tone: "neutral" },
  revoked: { label: "Invite revoked", tone: "neutral" },
  none: { label: "Not invited", tone: "neutral" },
};

export const LEASE_STATUS_META: Record<LeaseStatus, { label: string; tone: Tone }> = {
  upcoming: { label: "Upcoming", tone: "info" },
  active: { label: "Active", tone: "success" },
  ended: { label: "Ended", tone: "neutral" },
};

/** Phase 4: pipeline status for prospects in the Leasing CRM. */
export const LEAD_STATUS_META: Record<LeadStatus, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "info" },
  contacted: { label: "Contacted", tone: "info" },
  qualified: { label: "Qualified", tone: "success" },
  tour_scheduled: { label: "Tour Scheduled", tone: "info" },
  applied: { label: "Applied", tone: "warning" },
  converted: { label: "Converted", tone: "success" },
  disqualified: { label: "Disqualified", tone: "neutral" },
  lost: { label: "Lost", tone: "neutral" },
};

/** Phase 4: where the lead came from (attribution). */
export const LEAD_SOURCE_META: Record<LeadSource, { label: string; tone: Tone }> = {
  website: { label: "Website", tone: "neutral" },
  referral: { label: "Referral", tone: "neutral" },
  walkin: { label: "Walk-in", tone: "neutral" },
  partner: { label: "Partner", tone: "neutral" },
  other: { label: "Other", tone: "neutral" },
};

/** Phase 4 (slice 9b): tour lifecycle for the Leasing pipeline. */
export const TOUR_STATUS_META: Record<TourStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "Scheduled", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  no_show: { label: "No-show", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** Phase 4 (slice 9c): application lifecycle for the Leasing pipeline. */
export const APPLICATION_STATUS_META: Record<
  ApplicationStatus,
  { label: string; tone: Tone }
> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Submitted", tone: "info" },
  under_review: { label: "Under Review", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "warning" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

/** Phase 5 (slice 10a): rent charge lifecycle. status='voided' excluded from aging per §0.5 decision 10. */
export const RENT_CHARGE_STATUS_META: Record<
  RentChargeStatus,
  { label: string; tone: Tone }
> = {
  open: { label: "Open", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  partial: { label: "Partial", tone: "warning" },
  voided: { label: "Voided", tone: "neutral" },
};

/** Phase 5 (slice 10a): charge category. 'credit' absorbs overpayments per §0.5 decision 2. */
export const RENT_CHARGE_TYPE_META: Record<
  RentChargeType,
  { label: string; tone: Tone }
> = {
  rent: { label: "Rent", tone: "info" },
  deposit: { label: "Deposit", tone: "neutral" },
  fee: { label: "Fee", tone: "warning" },
  credit: { label: "Credit", tone: "success" },
  other: { label: "Other", tone: "neutral" },
};

/** Phase 5 (slice 10b): payment method labels. 'credit' deliberately absent — overlaps with rent_charge_type='credit'. */
export const PAYMENT_METHOD_META: Record<
  PaymentMethod,
  { label: string; tone: Tone }
> = {
  cash: { label: "Cash", tone: "success" },
  check: { label: "Check", tone: "success" },
  ach: { label: "ACH", tone: "success" },
  wire: { label: "Wire", tone: "success" },
  money_order: { label: "Money order", tone: "success" },
  zelle: { label: "Zelle", tone: "success" },
  card_offline: { label: "Card (offline)", tone: "info" },
  other: { label: "Other", tone: "neutral" },
};

export const BUILDING_STATUS_META: Record<
  BuildingStatus,
  { label: string; tone: Tone }
> = {
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "neutral" },
  under_construction: { label: "Under Construction", tone: "warning" },
};

export const ORG_STATUS_META: Record<
  OrganizationStatus,
  { label: string; tone: Tone }
> = {
  trial: { label: "Trial", tone: "info" },
  active: { label: "Active", tone: "success" },
  suspended: { label: "Suspended", tone: "danger" },
};

/** Units in these statuses count as occupied for occupancy calculations. */
export const OCCUPIED_UNIT_STATUSES: UnitStatus[] = ["occupied", "notice"];

// ---------------------------------------------------------------------------
// US states — for address selects
// ---------------------------------------------------------------------------
export const US_STATES: { value: string; label: string }[] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"],
  ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"],
  ["WI", "Wisconsin"], ["WY", "Wyoming"], ["DC", "Washington, D.C."],
].map(([value, label]) => ({ value, label }));

// ---------------------------------------------------------------------------
// Phase 2 — maintenance, work orders, vendors
// ---------------------------------------------------------------------------
export const MAINTENANCE_PRIORITY_META: Record<
  MaintenancePriority,
  { label: string; tone: Tone }
> = {
  low: { label: "Low", tone: "neutral" },
  medium: { label: "Medium", tone: "info" },
  high: { label: "High", tone: "warning" },
  emergency: { label: "Emergency", tone: "danger" },
};

export const MAINTENANCE_STATUS_META: Record<
  MaintenanceStatus,
  { label: string; tone: Tone }
> = {
  submitted: { label: "Submitted", tone: "info" },
  triaged: { label: "Triaged", tone: "info" },
  scheduled: { label: "Scheduled", tone: "info" },
  in_progress: { label: "In Progress", tone: "warning" },
  on_hold: { label: "On Hold", tone: "neutral" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/**
 * Tenant-facing maintenance status meta. The portal collapses the 7 internal
 * statuses into 5 user-friendly states — triaged and on_hold are internal
 * staff concepts and don't surface to the tenant.
 */
export const TENANT_MAINTENANCE_STATUS_META: Record<
  TenantMaintenanceStatus,
  { label: string; tone: Tone }
> = {
  submitted: { label: "Submitted", tone: "info" },
  scheduled: { label: "Scheduled", tone: "info" },
  in_progress: { label: "In progress", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** Collapse an internal maintenance_status to its tenant-facing equivalent. */
export function toTenantMaintenanceStatus(
  s: MaintenanceStatus,
): TenantMaintenanceStatus {
  switch (s) {
    case "triaged":
      return "submitted";
    case "on_hold":
      return "in_progress";
    case "submitted":
    case "scheduled":
    case "in_progress":
    case "completed":
    case "cancelled":
      return s;
  }
}

export const MAINTENANCE_CATEGORY_LABELS: Record<MaintenanceCategory, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  hvac: "HVAC",
  appliance: "Appliance",
  structural: "Structural",
  pest: "Pest Control",
  landscaping: "Landscaping",
  locks: "Locks & Keys",
  general: "General",
  other: "Other",
};

/** All maintenance categories as a typed tuple — for prompts, validators. */
export const MAINTENANCE_CATEGORIES = [
  "plumbing",
  "electrical",
  "hvac",
  "appliance",
  "structural",
  "pest",
  "landscaping",
  "locks",
  "general",
  "other",
] as const satisfies readonly MaintenanceCategory[];

/** All maintenance priorities as a typed tuple — for prompts, validators. */
export const MAINTENANCE_PRIORITIES = [
  "low",
  "medium",
  "high",
  "emergency",
] as const satisfies readonly MaintenancePriority[];

export const WORK_ORDER_STATUS_META: Record<
  WorkOrderStatus,
  { label: string; tone: Tone }
> = {
  open: { label: "Open", tone: "info" },
  assigned: { label: "Assigned", tone: "info" },
  accepted: { label: "Accepted", tone: "info" },
  in_progress: { label: "In Progress", tone: "warning" },
  on_hold: { label: "On Hold", tone: "neutral" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const WORK_ORDER_ASSIGNEE_LABELS: Record<WorkOrderAssignee, string> = {
  unassigned: "Unassigned",
  internal: "Internal Team",
  vendor: "Vendor",
};

/** Work-order statuses that count as still-open work. */
export const OPEN_WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  "open",
  "assigned",
  "accepted",
  "in_progress",
  "on_hold",
];

export const VENDOR_STATUS_META: Record<
  VendorStatus,
  { label: string; tone: Tone }
> = {
  pending: { label: "Pending", tone: "warning" },
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "neutral" },
  suspended: { label: "Suspended", tone: "danger" },
};

export const VENDOR_DOCUMENT_TYPE_LABELS: Record<VendorDocumentType, string> = {
  insurance: "Insurance",
  license: "License",
  w9: "W-9",
  contract: "Contract",
  certification: "Certification",
  other: "Other",
};

export const VENDOR_INVOICE_STATUS_META: Record<
  VendorInvoiceStatus,
  { label: string; tone: Tone }
> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Submitted", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  paid: { label: "Paid", tone: "success" },
};

export const APP_NAME = "Orkestr8";
export const APP_TAGLINE = "The AI Operating System for Multifamily Property Management";

/** Supabase Storage bucket for work-order photos (private, server-mediated). */
export const WORK_ORDER_PHOTO_BUCKET = "work-order-photos";

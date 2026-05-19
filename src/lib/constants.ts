/**
 * constants.ts — static reference data: role definitions, enum labels, and
 * display metadata. Pure data only (no React) so it is safe on server or
 * client.
 */
import type {
  AiMode,
  BuildingStatus,
  OrganizationStatus,
  PropertyType,
  TenantStatus,
  UnitStatus,
  UserRole,
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

export const APP_NAME = "PMS-Build";
export const APP_TAGLINE = "The AI Operating System for Multifamily Property Management";

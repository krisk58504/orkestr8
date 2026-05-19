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
export type AuditLog = Tables<"audit_logs">;
export type Notification = Tables<"notifications">;
export type AiLog = Tables<"ai_logs">;
export type AutomationLog = Tables<"automation_logs">;

export type UserRole = Enums<"user_role">;
export type AiMode = Enums<"ai_mode">;
export type EmailMode = Enums<"email_mode">;
export type OrganizationStatus = Enums<"organization_status">;
export type PropertyType = Enums<"property_type">;
export type BuildingStatus = Enums<"building_status">;
export type UnitStatus = Enums<"unit_status">;
export type TenantStatus = Enums<"tenant_status">;

/** Resolved identity for the signed-in user, loaded once per request. */
export type SessionContext = {
  authUserId: string;
  email: string;
  profile: AppUser;
  organization: Organization;
  roles: UserRole[];
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

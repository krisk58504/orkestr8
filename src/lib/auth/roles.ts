/**
 * roles.ts — pure role-check helpers. No I/O; safe on server or client.
 */
import {
  MANAGEMENT_ROLES,
  STAFF_ROLES,
  TENANT_WRITE_ROLES,
} from "@/lib/constants";
import type { UserRole } from "@/lib/types/app";

export function hasAnyRole(roles: UserRole[], allowed: UserRole[]): boolean {
  return roles.some((r) => allowed.includes(r));
}

/** Can create/edit properties, buildings, units. */
export function isManager(roles: UserRole[]): boolean {
  return hasAnyRole(roles, MANAGEMENT_ROLES);
}

/** Internal staff — may view management data. */
export function isStaff(roles: UserRole[]): boolean {
  return hasAnyRole(roles, STAFF_ROLES);
}

/** Can create/edit tenant records (management + leasing). */
export function canWriteTenants(roles: UserRole[]): boolean {
  return hasAnyRole(roles, TENANT_WRITE_ROLES);
}

/** Owner-level control of the organization and its team. */
export function isOwner(roles: UserRole[]): boolean {
  return hasAnyRole(roles, ["OWNER", "SUPER_ADMIN"]);
}

/** External vendor-company user (vendor portal). */
export function isVendorUser(roles: UserRole[]): boolean {
  return hasAnyRole(roles, ["VENDOR_ADMIN", "VENDOR_TECH"]);
}

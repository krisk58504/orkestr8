/**
 * DEMO DATA SEED — DESTRUCTIVE
 *
 * This script wipes existing data in the org "Sterling Property Group"
 * (and only that org) before re-seeding. Run only against the demo
 * Supabase project. The script will REFUSE to run unless:
 *   - SUPABASE_SERVICE_ROLE_KEY is set
 *   - --confirm is passed on the command line
 *
 * Idempotency: looks up Sterling by slug. On re-run it KEEPS the same
 * organizations row (preserving users.organization_id bindings — the
 * protect_user_columns trigger forbids reassignment) and only deletes
 * the org's children. If any of the 3 demo auth users are currently
 * bound to a different org, the seed errors out cleanly rather than
 * corrupting state.
 *
 * Run: npm run seed:demo
 *      or: npx tsx scripts/seed-demo-data.ts --confirm
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import type { Database, Json } from "../src/lib/types/database";

config({ path: ".env.local" });

// ---- Constants -----------------------------------------------------------

const MANAGER_AUTH_ID = "79f8bcf8-9678-4860-a640-5fa80b9f1151";
const OWNER_AUTH_ID = "a355041c-7ba0-4367-ae48-c99c1d835bf2";
const TENANT_AUTH_ID = "5d241527-cc18-486e-8f70-add9de147386";

const ORG_NAME = "Sterling Property Group";
const ORG_SLUG = "sterling-property-group";

const MANAGER_NAME = "Jordan Bennett";
const OWNER_NAME = "Margaret Sterling";
const TENANT_NAME = "Alex Morgan";

// ---- CLI gate ------------------------------------------------------------

if (!process.argv.includes("--confirm")) {
  console.error(
    "REFUSING TO RUN: --confirm flag is required. This script DELETES " +
      'data in the "Sterling Property Group" org before re-seeding.',
  );
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "FATAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must " +
      "be set in .env.local. Service-role key is required (RLS bypass).",
  );
  process.exit(1);
}

const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SERVICE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

// ---- Helpers -------------------------------------------------------------

function log(stage: string, detail?: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${stage}${detail ? ` — ${detail}` : ""}`);
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function dateOnlyDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function dateOnlyMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function addMonthsToDateOnly(dateOnly: string, months: number): string {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

async function expectOne<T>(
  label: string,
  query: PromiseLike<{ data: T | null; error: unknown }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${JSON.stringify(error)}`);
  if (!data) throw new Error(`${label}: no row returned`);
  return data;
}

async function expectMany<T>(
  label: string,
  query: PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${JSON.stringify(error)}`);
  if (!data) throw new Error(`${label}: no rows returned`);
  return data;
}

// ==========================================================================
// Phase 1 — Pre-flight: verify all 3 auth users exist in public.users
// ==========================================================================

async function preflightUsers(): Promise<{
  managerOrgId: string | null;
  ownerOrgId: string | null;
  tenantOrgId: string | null;
}> {
  const { data: users, error } = await supabase
    .from("users")
    .select("id, email, organization_id, full_name")
    .in("id", [MANAGER_AUTH_ID, OWNER_AUTH_ID, TENANT_AUTH_ID]);
  if (error) throw new Error(`preflight users: ${JSON.stringify(error)}`);

  const byId = new Map((users ?? []).map((u) => [u.id, u]));
  for (const [id, label] of [
    [MANAGER_AUTH_ID, "Manager"],
    [OWNER_AUTH_ID, "Owner"],
    [TENANT_AUTH_ID, "Tenant"],
  ] as const) {
    if (!byId.has(id)) {
      throw new Error(
        `Pre-flight failure: ${label} auth user ${id} has no public.users row. ` +
          `Sign up the demo user via Supabase auth first (the handle_new_user ` +
          `trigger will populate public.users).`,
      );
    }
  }

  log("✓ Pre-flight users", `3/3 auth users present in public.users`);
  return {
    managerOrgId: byId.get(MANAGER_AUTH_ID)?.organization_id ?? null,
    ownerOrgId: byId.get(OWNER_AUTH_ID)?.organization_id ?? null,
    tenantOrgId: byId.get(TENANT_AUTH_ID)?.organization_id ?? null,
  };
}

// ==========================================================================
// Phase 2 — Resolve Sterling org (lookup by slug; keep id across re-runs)
// ==========================================================================

async function resolveSterlingOrgId(): Promise<string> {
  const { data: existing } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", ORG_SLUG)
    .maybeSingle();

  if (existing) {
    log("✓ Sterling org found", `id=${existing.id} (re-using)`);
    return existing.id;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("organizations")
    .insert({
      name: ORG_NAME,
      slug: ORG_SLUG,
      status: "active",
      ai_mode: "suggest_only",
      email_mode: "test",
    })
    .select("id")
    .single();
  if (insertErr) throw new Error(`insert organization: ${JSON.stringify(insertErr)}`);
  if (!inserted) throw new Error("insert organization: no row returned");
  log("✓ Sterling org created", `id=${inserted.id}`);
  return inserted.id;
}

// ==========================================================================
// Phase 3 — Verify users are not bound to a different org
// ==========================================================================

function verifyUserOrgConsistency(
  sterlingOrgId: string,
  preflight: Awaited<ReturnType<typeof preflightUsers>>,
): void {
  for (const [orgId, label] of [
    [preflight.managerOrgId, `Manager (${MANAGER_AUTH_ID})`],
    [preflight.ownerOrgId, `Owner (${OWNER_AUTH_ID})`],
    [preflight.tenantOrgId, `Tenant (${TENANT_AUTH_ID})`],
  ] as const) {
    if (orgId !== null && orgId !== sterlingOrgId) {
      throw new Error(
        `Pre-flight failure: ${label} is already bound to org ${orgId}, not Sterling (${sterlingOrgId}). ` +
          `The protect_user_columns trigger forbids reassignment. Sign up a fresh demo user instead.`,
      );
    }
  }
  log("✓ User org bindings consistent", "no conflicts");
}

// ==========================================================================
// Phase 4 — Cleanup Sterling's children (idempotent re-run)
// ==========================================================================

async function cleanupSterlingChildren(orgId: string): Promise<void> {
  // Order: leaves → roots. payments first (FK RESTRICT on rent_charges
  // and tenants); rent_charges next; vendor_ratings + work_orders +
  // maintenance_requests in any order (no inter-FK blocks among them);
  // tenants + leases; units; buildings; vendors; user_roles for the 3
  // demo users; property_owners; properties.
  //
  // Each table called explicitly because supabase-js's typed `.eq()` can't
  // narrow "organization_id" across a polymorphic table union.
  async function clean(label: string, count?: number) {
    log(`✓ cleaned ${label}`, `${count ?? 0} rows`);
  }
  let r;
  r = await supabase.from("payments").delete({ count: "exact" }).eq("organization_id", orgId);
  if (r.error) throw new Error(`cleanup payments: ${JSON.stringify(r.error)}`);
  await clean("payments", r.count ?? undefined);
  r = await supabase.from("rent_charges").delete({ count: "exact" }).eq("organization_id", orgId);
  if (r.error) throw new Error(`cleanup rent_charges: ${JSON.stringify(r.error)}`);
  await clean("rent_charges", r.count ?? undefined);
  r = await supabase.from("vendor_ratings").delete({ count: "exact" }).eq("organization_id", orgId);
  if (r.error) throw new Error(`cleanup vendor_ratings: ${JSON.stringify(r.error)}`);
  await clean("vendor_ratings", r.count ?? undefined);
  r = await supabase.from("work_orders").delete({ count: "exact" }).eq("organization_id", orgId);
  if (r.error) throw new Error(`cleanup work_orders: ${JSON.stringify(r.error)}`);
  await clean("work_orders", r.count ?? undefined);
  r = await supabase.from("maintenance_requests").delete({ count: "exact" }).eq("organization_id", orgId);
  if (r.error) throw new Error(`cleanup maintenance_requests: ${JSON.stringify(r.error)}`);
  await clean("maintenance_requests", r.count ?? undefined);
  r = await supabase.from("tenant_invites").delete({ count: "exact" }).eq("organization_id", orgId);
  if (r.error) throw new Error(`cleanup tenant_invites: ${JSON.stringify(r.error)}`);
  await clean("tenant_invites", r.count ?? undefined);
  r = await supabase.from("tenants").delete({ count: "exact" }).eq("organization_id", orgId);
  if (r.error) throw new Error(`cleanup tenants: ${JSON.stringify(r.error)}`);
  await clean("tenants", r.count ?? undefined);
  r = await supabase.from("leases").delete({ count: "exact" }).eq("organization_id", orgId);
  if (r.error) throw new Error(`cleanup leases: ${JSON.stringify(r.error)}`);
  await clean("leases", r.count ?? undefined);
  r = await supabase.from("units").delete({ count: "exact" }).eq("organization_id", orgId);
  if (r.error) throw new Error(`cleanup units: ${JSON.stringify(r.error)}`);
  await clean("units", r.count ?? undefined);
  r = await supabase.from("buildings").delete({ count: "exact" }).eq("organization_id", orgId);
  if (r.error) throw new Error(`cleanup buildings: ${JSON.stringify(r.error)}`);
  await clean("buildings", r.count ?? undefined);
  r = await supabase.from("property_owners").delete({ count: "exact" }).eq("organization_id", orgId);
  if (r.error) throw new Error(`cleanup property_owners: ${JSON.stringify(r.error)}`);
  await clean("property_owners", r.count ?? undefined);
  r = await supabase.from("vendor_contacts").delete({ count: "exact" }).eq("organization_id", orgId);
  if (r.error) throw new Error(`cleanup vendor_contacts: ${JSON.stringify(r.error)}`);
  await clean("vendor_contacts", r.count ?? undefined);
  r = await supabase.from("vendors").delete({ count: "exact" }).eq("organization_id", orgId);
  if (r.error) throw new Error(`cleanup vendors: ${JSON.stringify(r.error)}`);
  await clean("vendors", r.count ?? undefined);
  r = await supabase.from("user_roles").delete({ count: "exact" }).eq("organization_id", orgId);
  if (r.error) throw new Error(`cleanup user_roles: ${JSON.stringify(r.error)}`);
  await clean("user_roles", r.count ?? undefined);
  r = await supabase.from("properties").delete({ count: "exact" }).eq("organization_id", orgId);
  if (r.error) throw new Error(`cleanup properties: ${JSON.stringify(r.error)}`);
  await clean("properties", r.count ?? undefined);
}

// ==========================================================================
// Phase 5 — Bind users to org + insert user_roles
// ==========================================================================

async function bindUsersAndRoles(orgId: string): Promise<void> {
  // protect_user_columns trigger:
  //   - trusted (service_role) callers may set NULL -> value once
  //   - reassignment of a non-NULL to a different value raises
  //   - setting the same value (no-op) is allowed
  // We've already verified consistency. Now ensure each user is bound +
  // has the right full_name + has the right user_roles row.
  const userUpdates: Array<{ id: string; full_name: string }> = [
    { id: MANAGER_AUTH_ID, full_name: MANAGER_NAME },
    { id: OWNER_AUTH_ID, full_name: OWNER_NAME },
    { id: TENANT_AUTH_ID, full_name: TENANT_NAME },
  ];
  for (const u of userUpdates) {
    const { error } = await supabase
      .from("users")
      .update({ organization_id: orgId, full_name: u.full_name })
      .eq("id", u.id);
    if (error) throw new Error(`bind user ${u.id}: ${JSON.stringify(error)}`);
  }
  log("✓ users bound to Sterling", "3 users (organization_id + full_name)");

  const roleRows: Array<{
    user_id: string;
    role: Database["public"]["Enums"]["user_role"];
  }> = [
    { user_id: MANAGER_AUTH_ID, role: "PROPERTY_MANAGER" },
    { user_id: OWNER_AUTH_ID, role: "INVESTOR" },
    { user_id: TENANT_AUTH_ID, role: "TENANT" },
  ];
  const { error: roleErr } = await supabase.from("user_roles").insert(
    roleRows.map((r) => ({
      user_id: r.user_id,
      organization_id: orgId,
      role: r.role,
    })),
  );
  if (roleErr) throw new Error(`user_roles: ${JSON.stringify(roleErr)}`);
  log(
    "✓ user_roles inserted",
    "Jordan=PROPERTY_MANAGER, Margaret=INVESTOR, Alex=TENANT",
  );
}

// ==========================================================================
// Phase 6 — Properties + Buildings + Units
// ==========================================================================

type PortfolioProperty = {
  id: string;
  buildingId: string;
  unitIds: Array<{ unitId: string; unitNumber: string }>;
};

type Portfolio = {
  maple: PortfolioProperty;
  riverside: PortfolioProperty;
  oak: PortfolioProperty;
};

const MAPLE_UNITS = [
  { number: "1A", floor: 1, bedrooms: 1, bathrooms: 1, rent: 1450, status: "occupied" as const },
  { number: "1B", floor: 1, bedrooms: 1, bathrooms: 1, rent: 1450, status: "vacant" as const },
  { number: "1C", floor: 1, bedrooms: 2, bathrooms: 1, rent: 1650, status: "occupied" as const },
  { number: "1D", floor: 1, bedrooms: 2, bathrooms: 1, rent: 1650, status: "occupied" as const },
  { number: "2A", floor: 2, bedrooms: 1, bathrooms: 1, rent: 1500, status: "occupied" as const },
  { number: "2B", floor: 2, bedrooms: 2, bathrooms: 1, rent: 1650, status: "occupied" as const },
  { number: "2C", floor: 2, bedrooms: 2, bathrooms: 2, rent: 1800, status: "occupied" as const },
  { number: "2D", floor: 2, bedrooms: 2, bathrooms: 2, rent: 1800, status: "vacant" as const },
];

const RIVERSIDE_UNITS = [
  { number: "L1", floor: 1, bedrooms: 1, bathrooms: 1, rent: 1800, status: "occupied" as const },
  { number: "L2", floor: 1, bedrooms: 1, bathrooms: 1, rent: 1850, status: "occupied" as const },
  { number: "L3", floor: 2, bedrooms: 2, bathrooms: 2, rent: 2100, status: "occupied" as const },
  { number: "L4", floor: 2, bedrooms: 2, bathrooms: 2, rent: 2100, status: "vacant" as const },
  { number: "L5", floor: 3, bedrooms: 2, bathrooms: 2, rent: 2200, status: "occupied" as const },
  { number: "L6", floor: 3, bedrooms: 2, bathrooms: 2, rent: 2200, status: "vacant" as const },
];

const OAK_UNITS = [
  { number: "1", floor: 1, bedrooms: 2, bathrooms: 2.5, rent: 1950, status: "occupied" as const },
  { number: "2", floor: 1, bedrooms: 2, bathrooms: 2.5, rent: 1950, status: "occupied" as const },
  { number: "3", floor: 1, bedrooms: 3, bathrooms: 2.5, rent: 2200, status: "occupied" as const },
  { number: "4", floor: 1, bedrooms: 3, bathrooms: 2.5, rent: 2300, status: "occupied" as const },
  { number: "5", floor: 1, bedrooms: 3, bathrooms: 2.5, rent: 2400, status: "vacant" as const },
  { number: "6", floor: 1, bedrooms: 3, bathrooms: 2.5, rent: 2400, status: "occupied" as const },
];

async function seedPropertiesBuildingsUnits(
  orgId: string,
): Promise<Portfolio> {
  // Properties
  const propertyRows = await expectMany(
    "insert properties",
    supabase
      .from("properties")
      .insert([
        {
          organization_id: orgId,
          name: "Maple Heights Apartments",
          property_type: "apartment",
          address_line1: "4200 Legacy Drive",
          city: "Plano",
          state: "TX",
          postal_code: "75024",
          country: "US",
          year_built: 2008,
          planned_units: 8,
          description: "Garden-style mid-rise apartment community in West Plano.",
        },
        {
          organization_id: orgId,
          name: "Riverside Lofts",
          property_type: "mixed_use",
          address_line1: "312 W 7th Street",
          city: "Dallas",
          state: "TX",
          postal_code: "75208",
          country: "US",
          year_built: 1923,
          planned_units: 6,
          description: "Converted warehouse loft conversion in the Bishop Arts District.",
        },
        {
          organization_id: orgId,
          name: "Oak Street Townhomes",
          property_type: "townhome",
          address_line1: "1850 Custer Parkway",
          city: "Richardson",
          state: "TX",
          postal_code: "75080",
          country: "US",
          year_built: 2015,
          planned_units: 6,
          description: "Townhome community in Richardson with attached garages.",
        },
      ])
      .select("id, name"),
  );
  const maple = propertyRows.find((p) => p.name.startsWith("Maple"))!;
  const riverside = propertyRows.find((p) => p.name.startsWith("Riverside"))!;
  const oak = propertyRows.find((p) => p.name.startsWith("Oak"))!;
  log("✓ properties inserted", "3");

  // Buildings (1 per property)
  const buildingRows = await expectMany(
    "insert buildings",
    supabase
      .from("buildings")
      .insert([
        {
          organization_id: orgId,
          property_id: maple.id,
          name: "Building A",
          status: "active",
          floors: 2,
          year_built: 2008,
        },
        {
          organization_id: orgId,
          property_id: riverside.id,
          name: "Main Loft",
          status: "active",
          floors: 3,
          year_built: 1923,
        },
        {
          organization_id: orgId,
          property_id: oak.id,
          name: "Townhome Row",
          status: "active",
          floors: 1,
        },
      ])
      .select("id, property_id"),
  );
  const mapleBuilding = buildingRows.find((b) => b.property_id === maple.id)!;
  const riversideBuilding = buildingRows.find((b) => b.property_id === riverside.id)!;
  const oakBuilding = buildingRows.find((b) => b.property_id === oak.id)!;
  log("✓ buildings inserted", "3");

  // Units
  function unitInserts(
    propertyId: string,
    buildingId: string,
    units: typeof MAPLE_UNITS,
  ): Database["public"]["Tables"]["units"]["Insert"][] {
    return units.map((u) => ({
      organization_id: orgId,
      property_id: propertyId,
      building_id: buildingId,
      unit_number: u.number,
      floor: u.floor,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      market_rent: u.rent,
      status: u.status,
      is_active: true,
    }));
  }
  const unitsAll = [
    ...unitInserts(maple.id, mapleBuilding.id, MAPLE_UNITS),
    ...unitInserts(riverside.id, riversideBuilding.id, RIVERSIDE_UNITS),
    ...unitInserts(oak.id, oakBuilding.id, OAK_UNITS),
  ];
  const insertedUnits = await expectMany(
    "insert units",
    supabase
      .from("units")
      .insert(unitsAll)
      .select("id, property_id, unit_number"),
  );
  log("✓ units inserted", `${insertedUnits.length} (20 total)`);

  function unitsFor(propertyId: string) {
    return insertedUnits
      .filter((u) => u.property_id === propertyId)
      .map((u) => ({ unitId: u.id, unitNumber: u.unit_number }));
  }
  return {
    maple: {
      id: maple.id,
      buildingId: mapleBuilding.id,
      unitIds: unitsFor(maple.id),
    },
    riverside: {
      id: riverside.id,
      buildingId: riversideBuilding.id,
      unitIds: unitsFor(riverside.id),
    },
    oak: {
      id: oak.id,
      buildingId: oakBuilding.id,
      unitIds: unitsFor(oak.id),
    },
  };
}

// ==========================================================================
// Phase 7 — Vendors
// ==========================================================================

type VendorMap = {
  hvac: string;
  plumbing: string;
  handyman: string;
};

async function seedVendors(orgId: string): Promise<VendorMap> {
  const rows = await expectMany(
    "insert vendors",
    supabase
      .from("vendors")
      .insert([
        {
          organization_id: orgId,
          name: "DFW HVAC Solutions",
          trade: "HVAC",
          status: "active",
          phone: "469-555-0142",
          email: "dispatch@dfwhvacsolutions.example.com",
          city: "Plano",
          state: "TX",
          is_active: true,
          rating_avg: 4.5,
          rating_count: 2,
        },
        {
          organization_id: orgId,
          name: "Lone Star Plumbing",
          trade: "Plumbing",
          status: "active",
          phone: "972-555-0188",
          email: "service@lonestarplumbing.example.com",
          city: "Dallas",
          state: "TX",
          is_active: true,
          rating_avg: 3.5,
          rating_count: 2,
        },
        {
          organization_id: orgId,
          name: "North Texas Handyman Co.",
          trade: "General",
          status: "active",
          phone: "214-555-0167",
          email: "hello@ntxhandyman.example.com",
          city: "Richardson",
          state: "TX",
          is_active: true,
          rating_avg: 4.75,
          rating_count: 4,
        },
      ])
      .select("id, name"),
  );
  log("✓ vendors inserted", "3");
  const hvac = rows.find((v) => v.name.startsWith("DFW"))!.id;
  const plumbing = rows.find((v) => v.name.startsWith("Lone"))!.id;
  const handyman = rows.find((v) => v.name.startsWith("North"))!.id;
  return { hvac, plumbing, handyman };
}

// ==========================================================================
// Phase 8 — Leases (15, all active, staggered start dates)
// ==========================================================================

type LeaseAssignment = {
  property: "maple" | "riverside" | "oak";
  unitNumber: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  monthsBack: number; // start_date = today - monthsBack months
  monthlyRent: number;
  authUserId?: string; // Alex Morgan only
};

const LEASE_PLAN: LeaseAssignment[] = [
  // Maple Heights (6 leased)
  { property: "maple", unitNumber: "1A", tenantName: "Alex Morgan", tenantEmail: "alex.morgan@example.com", tenantPhone: "469-555-0201", monthsBack: 6, monthlyRent: 1450, authUserId: TENANT_AUTH_ID },
  { property: "maple", unitNumber: "1C", tenantName: "Carlos Mendoza", tenantEmail: "carlos.mendoza@example.com", tenantPhone: "214-555-0202", monthsBack: 13, monthlyRent: 1650 },
  { property: "maple", unitNumber: "1D", tenantName: "Priya Sharma", tenantEmail: "priya.sharma@example.com", tenantPhone: "972-555-0203", monthsBack: 4, monthlyRent: 1650 },
  { property: "maple", unitNumber: "2A", tenantName: "Marcus Rivera", tenantEmail: "marcus.rivera@example.com", tenantPhone: "469-555-0204", monthsBack: 10, monthlyRent: 1500 },
  { property: "maple", unitNumber: "2B", tenantName: "Tyler Anderson", tenantEmail: "tyler.anderson@example.com", tenantPhone: "214-555-0205", monthsBack: 8, monthlyRent: 1650 },
  { property: "maple", unitNumber: "2C", tenantName: "Jasmine Williams", tenantEmail: "jasmine.williams@example.com", tenantPhone: "972-555-0206", monthsBack: 15, monthlyRent: 1800 },
  // Riverside Lofts (4 leased)
  { property: "riverside", unitNumber: "L1", tenantName: "Sarah Chen", tenantEmail: "sarah.chen@example.com", tenantPhone: "469-555-0207", monthsBack: 11, monthlyRent: 1800 },
  { property: "riverside", unitNumber: "L2", tenantName: "James Okonkwo", tenantEmail: "james.okonkwo@example.com", tenantPhone: "214-555-0208", monthsBack: 2, monthlyRent: 1850 },
  { property: "riverside", unitNumber: "L3", tenantName: "Aisha Patel", tenantEmail: "aisha.patel@example.com", tenantPhone: "972-555-0209", monthsBack: 9, monthlyRent: 2100 },
  { property: "riverside", unitNumber: "L5", tenantName: "Maya Johnson", tenantEmail: "maya.johnson@example.com", tenantPhone: "469-555-0210", monthsBack: 17, monthlyRent: 2200 },
  // Oak Street (5 leased)
  { property: "oak", unitNumber: "1", tenantName: "Emily Thompson", tenantEmail: "emily.thompson@example.com", tenantPhone: "214-555-0211", monthsBack: 7, monthlyRent: 1950 },
  { property: "oak", unitNumber: "2", tenantName: "David Park", tenantEmail: "david.park@example.com", tenantPhone: "972-555-0212", monthsBack: 14, monthlyRent: 1950 },
  { property: "oak", unitNumber: "3", tenantName: "Michael O'Brien", tenantEmail: "michael.obrien@example.com", tenantPhone: "469-555-0213", monthsBack: 5, monthlyRent: 2200 },
  { property: "oak", unitNumber: "4", tenantName: "Daniel Kim", tenantEmail: "daniel.kim@example.com", tenantPhone: "214-555-0214", monthsBack: 3, monthlyRent: 2300 },
  { property: "oak", unitNumber: "6", tenantName: "Sofia Ramirez", tenantEmail: "sofia.ramirez@example.com", tenantPhone: "972-555-0215", monthsBack: 12, monthlyRent: 2400 },
];

type LeasedRow = LeaseAssignment & {
  unitId: string;
  propertyId: string;
  leaseId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
};

async function seedLeasesAndTenants(
  orgId: string,
  portfolio: Portfolio,
): Promise<LeasedRow[]> {
  // 1) Insert leases first (tenants.lease_id FK requires lease existence).
  function resolveUnit(plan: LeaseAssignment): { unitId: string; propertyId: string } {
    const p = portfolio[plan.property];
    const unit = p.unitIds.find((u) => u.unitNumber === plan.unitNumber);
    if (!unit) throw new Error(`unit ${plan.property} #${plan.unitNumber} not found`);
    return { unitId: unit.unitId, propertyId: p.id };
  }

  const leaseInserts = LEASE_PLAN.map((plan) => {
    const startDate = dateOnlyMonthsAgo(plan.monthsBack);
    const endDate = addMonthsToDateOnly(startDate, 12);
    const { unitId } = resolveUnit(plan);
    return {
      organization_id: orgId,
      unit_id: unitId,
      start_date: startDate,
      end_date: endDate,
      monthly_rent: plan.monthlyRent,
      status: "active" as const,
    };
  });

  const insertedLeases = await expectMany(
    "insert leases",
    supabase.from("leases").insert(leaseInserts).select("id, unit_id, start_date, end_date, monthly_rent"),
  );
  log("✓ leases inserted", `${insertedLeases.length} active`);

  // 2) Insert tenants pointing back at the leases via tenants.lease_id.
  const leaseByUnitId = new Map(insertedLeases.map((l) => [l.unit_id, l]));
  const tenantInserts = LEASE_PLAN.map((plan) => {
    const { unitId, propertyId } = resolveUnit(plan);
    const lease = leaseByUnitId.get(unitId)!;
    const [first, ...rest] = plan.tenantName.split(" ");
    return {
      organization_id: orgId,
      property_id: propertyId,
      unit_id: unitId,
      lease_id: lease.id,
      user_id: plan.authUserId ?? null,
      first_name: first,
      last_name: rest.join(" "),
      email: plan.tenantEmail,
      phone: plan.tenantPhone,
      status: "current" as const,
      move_in_date: lease.start_date,
    };
  });

  const insertedTenants = await expectMany(
    "insert tenants",
    supabase
      .from("tenants")
      .insert(tenantInserts)
      .select("id, unit_id, first_name, last_name"),
  );
  log("✓ tenants inserted", `${insertedTenants.length} (1 linked to TENANT_AUTH_ID)`);

  const tenantByUnitId = new Map(
    insertedTenants.map((t) => [t.unit_id ?? "", t]),
  );

  return LEASE_PLAN.map((plan) => {
    const { unitId, propertyId } = resolveUnit(plan);
    const lease = leaseByUnitId.get(unitId)!;
    const tenant = tenantByUnitId.get(unitId)!;
    return {
      ...plan,
      unitId,
      propertyId,
      leaseId: lease.id,
      tenantId: tenant.id,
      startDate: lease.start_date,
      endDate: lease.end_date ?? "",
    };
  });
}

// ==========================================================================
// Phase 9 — Rent charges + Payments (3 months history per lease)
// ==========================================================================

const PAYMENT_METHODS: Database["public"]["Enums"]["payment_method"][] = [
  "ach", "ach", "ach", "ach", "ach", "ach", // 6/10 ach (60%)
  "check", "check", "check", // 2.5/10 check (25%)
  "card_offline", "card_offline", // 1.5/10 card_offline (15%)
];

function paymentMethodForIndex(i: number): Database["public"]["Enums"]["payment_method"] {
  return PAYMENT_METHODS[i % PAYMENT_METHODS.length];
}

async function seedRentChargesAndPayments(
  orgId: string,
  leased: LeasedRow[],
): Promise<void> {
  // Compute first-of-month dates for the past 3 months.
  const now = new Date();
  const monthAnchors: { dueDate: string; periodStart: string; periodEnd: string }[] = [];
  for (let i = 2; i >= 0; i--) {
    const anchor = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0); // last day of month
    monthAnchors.push({
      dueDate: anchor.toISOString().slice(0, 10),
      periodStart: anchor.toISOString().slice(0, 10),
      periodEnd: periodEnd.toISOString().slice(0, 10),
    });
  }

  type ChargeRow = Database["public"]["Tables"]["rent_charges"]["Row"];
  const chargeInserts: Database["public"]["Tables"]["rent_charges"]["Insert"][] = [];
  for (const lease of leased) {
    for (const anchor of monthAnchors) {
      chargeInserts.push({
        organization_id: orgId,
        lease_id: lease.leaseId,
        tenant_id: lease.tenantId,
        unit_id: lease.unitId,
        charge_type: "rent",
        amount_due: lease.monthlyRent,
        due_date: anchor.dueDate,
        period_start: anchor.periodStart,
        period_end: anchor.periodEnd,
        status: "open",
        description: "Monthly rent",
      });
    }
  }
  const insertedCharges = await expectMany<ChargeRow>(
    "insert rent_charges",
    supabase
      .from("rent_charges")
      .insert(chargeInserts)
      .select("id, lease_id, tenant_id, due_date, amount_due"),
  );
  log("✓ rent_charges inserted", `${insertedCharges.length} (3 months × 15 leases)`);

  // Group charges by lease for payment generation.
  const chargesByLease = new Map<string, ChargeRow[]>();
  for (const c of insertedCharges) {
    const arr = chargesByLease.get(c.lease_id) ?? [];
    arr.push(c);
    chargesByLease.set(c.lease_id, arr);
  }
  for (const [leaseId, arr] of chargesByLease) {
    arr.sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    chargesByLease.set(leaseId, arr);
  }

  // Identify the late + partial tenants by name.
  const LATE_TENANT_NAME = "Michael O'Brien"; // 3rd month paid 8 days late, full amount
  const PARTIAL_TENANT_NAME = "Tyler Anderson"; // 3rd month $1,200 of $1,650 → partial

  type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];
  const paymentInserts: PaymentInsert[] = [];
  const chargeUpdates: Array<{ id: string; status: "paid" | "partial" }> = [];
  let paymentIdx = 0;
  for (const lease of leased) {
    const charges = chargesByLease.get(lease.leaseId);
    if (!charges) continue;
    charges.forEach((charge, monthIdx) => {
      const isLastMonth = monthIdx === 2;
      const isLate = isLastMonth && lease.tenantName === LATE_TENANT_NAME;
      const isPartial = isLastMonth && lease.tenantName === PARTIAL_TENANT_NAME;

      // On-time payment falls on the 3rd of the month (within 3-day grace).
      const dueDate = new Date(`${charge.due_date}T00:00:00Z`);
      const paidOffsetDays = isLate ? 8 : 2 + (paymentIdx % 3); // on-time = 2-4 days after due
      const paidAt = new Date(dueDate.getTime() + paidOffsetDays * 86_400_000);

      const amountPaid = isPartial ? 1200 : Number(charge.amount_due);
      const method = paymentMethodForIndex(paymentIdx++);

      paymentInserts.push({
        organization_id: orgId,
        charge_id: charge.id,
        tenant_id: lease.tenantId,
        amount_paid: amountPaid,
        paid_at: paidAt.toISOString(),
        method,
        recorded_by: MANAGER_AUTH_ID,
        notes: isLate
          ? "Paid late (per tenant notice — no late fee assessed)."
          : isPartial
            ? "Partial payment received. Balance to follow."
            : null,
      });

      chargeUpdates.push({
        id: charge.id,
        status: isPartial ? "partial" : "paid",
      });
    });
  }

  await expectMany(
    "insert payments",
    supabase.from("payments").insert(paymentInserts).select("id"),
  );
  log("✓ payments inserted", `${paymentInserts.length} (1 late, 1 partial)`);

  // Roll charge status: paid/partial (open stays for partial's outstanding balance? Actually partial means
  // some paid; remaining balance is still open via computeChargeBalance helper. status='partial' is correct).
  for (const update of chargeUpdates) {
    const { error } = await supabase
      .from("rent_charges")
      .update({ status: update.status })
      .eq("id", update.id);
    if (error) throw new Error(`update charge ${update.id}: ${JSON.stringify(error)}`);
  }
  log("✓ rent_charges status rolled", `44 paid, 1 partial`);
}

// ==========================================================================
// Phase 10 — Maintenance requests + Work orders + Vendor ratings
// ==========================================================================

const TRIAGE_AISHA: Json = {
  model: "claude-sonnet-4-6",
  suggestedPriority: "high",
  suggestedCategory: "hvac",
  urgencyScore: 72,
  confidence: 0.85,
  summary:
    "AC blowing warm air in master bedroom only — likely a refrigerant or compressor issue isolated to one zone. Recommend HVAC technician visit within 24-48 hours given current Texas heat.",
  recommendedActions: [
    "Schedule HVAC vendor visit within 48 hours",
    "Confirm whether the rest of the unit's cooling is normal",
    "Check thermostat settings in the affected room before dispatch",
  ],
  signals: ["AC", "warm air", "master bedroom", "isolated zone"],
  disclaimer:
    "Automated AI suggestion. Advisory only — review before acting.",
};

async function seedMaintenanceAndWorkOrders(
  orgId: string,
  leased: LeasedRow[],
  vendors: VendorMap,
): Promise<void> {
  function findByTenant(name: string): LeasedRow {
    const row = leased.find((l) => l.tenantName === name);
    if (!row) throw new Error(`tenant ${name} not found in leased plan`);
    return row;
  }
  const jasmine = findByTenant("Jasmine Williams");
  const aisha = findByTenant("Aisha Patel");
  const david = findByTenant("David Park");
  const alex = findByTenant("Alex Morgan");
  const sarah = findByTenant("Sarah Chen");
  const emily = findByTenant("Emily Thompson");
  const carlos = findByTenant("Carlos Mendoza");

  type ReqInsert = Database["public"]["Tables"]["maintenance_requests"]["Insert"];
  const requestInserts: ReqInsert[] = [
    // #1 — Maple 2C / Jasmine, garbage disposal, submitted
    {
      organization_id: orgId,
      property_id: jasmine.propertyId,
      unit_id: jasmine.unitId,
      tenant_id: jasmine.tenantId,
      reported_by: null,
      title: "Garbage disposal grinding intermittently",
      description:
        "Garbage disposal makes a loud metallic noise sometimes when running. Other times it works fine. Started about a week ago and seems to be getting worse.",
      category: "appliance",
      priority: "medium",
      status: "submitted",
      created_at: isoDaysAgo(2),
      updated_at: isoDaysAgo(2),
    },
    // #2 — Riverside L3 / Aisha, AC warm, triaged + ai_triage populated
    {
      organization_id: orgId,
      property_id: aisha.propertyId,
      unit_id: aisha.unitId,
      tenant_id: aisha.tenantId,
      reported_by: null,
      title: "AC blowing warm air in master bedroom",
      description:
        "AC blowing warm air in master bedroom only — rest of the unit is cooling fine. Started today, set thermostat lower, no change.",
      category: "hvac",
      priority: "high",
      status: "triaged",
      ai_triage: TRIAGE_AISHA,
      ai_triaged_at: isoDaysAgo(5),
      created_at: isoDaysAgo(5),
      updated_at: isoDaysAgo(5),
    },
    // #3 — Oak 2 / David, faucet leak, in_progress (work order assigned)
    {
      organization_id: orgId,
      property_id: david.propertyId,
      unit_id: david.unitId,
      tenant_id: david.tenantId,
      reported_by: null,
      title: "Kitchen faucet has a slow leak under the sink",
      description:
        "Slow leak under the kitchen sink — water pooling in the cabinet. Caught it before it got to the floor. The faucet itself works normally.",
      category: "plumbing",
      priority: "medium",
      status: "in_progress",
      created_at: isoDaysAgo(7),
      updated_at: isoDaysAgo(5),
    },
    // #4 — Maple 1A / Alex (TENANT_AUTH_ID), smoke detector chirping
    {
      organization_id: orgId,
      property_id: alex.propertyId,
      unit_id: alex.unitId,
      tenant_id: alex.tenantId,
      reported_by: TENANT_AUTH_ID,
      title: "Smoke detector chirping every 30 seconds",
      description:
        "Smoke detector in the hallway chirps every 30 seconds. I replaced the 9V battery yesterday — still chirping.",
      category: "electrical",
      priority: "low",
      status: "in_progress",
      created_at: isoDaysAgo(3),
      updated_at: isoDaysAgo(2),
    },
    // #5 — Riverside L1 / Sarah, garage door, completed
    {
      organization_id: orgId,
      property_id: sarah.propertyId,
      unit_id: sarah.unitId,
      tenant_id: sarah.tenantId,
      reported_by: null,
      title: "Garage door won't close fully",
      description:
        "Garage door bounces back up about 6 inches before reaching the ground. Sensor lights both green.",
      category: "general",
      priority: "medium",
      status: "completed",
      created_at: isoDaysAgo(21),
      updated_at: isoDaysAgo(14),
    },
    // #6 — Oak 4 / Emily, GFCI not working, completed
    {
      organization_id: orgId,
      property_id: emily.propertyId,
      unit_id: emily.unitId,
      tenant_id: emily.tenantId,
      reported_by: null,
      title: "Bathroom GFCI outlet not working",
      description:
        "GFCI outlet in master bathroom has no power. Tested with hair dryer and laptop charger.",
      category: "electrical",
      priority: "medium",
      status: "completed",
      created_at: isoDaysAgo(14),
      updated_at: isoDaysAgo(7),
    },
    // #7 — Maple 1C / Carlos, water heater knocking, submitted today
    {
      organization_id: orgId,
      property_id: carlos.propertyId,
      unit_id: carlos.unitId,
      tenant_id: carlos.tenantId,
      reported_by: null,
      title: "Hot water heater making loud knocking sound",
      description:
        "Loud knocking sound when the water heater cycles on. Hot water still works fine. Started this morning.",
      category: "plumbing",
      priority: "medium",
      status: "submitted",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  const insertedRequests = await expectMany(
    "insert maintenance_requests",
    supabase
      .from("maintenance_requests")
      .insert(requestInserts)
      .select("id, title"),
  );
  log("✓ maintenance_requests inserted", "7 (1 triaged with AI payload)");

  function reqByTitlePrefix(prefix: string): string {
    const r = insertedRequests.find((x) => x.title.startsWith(prefix));
    if (!r) throw new Error(`request matching '${prefix}' not found`);
    return r.id;
  }
  const req3 = reqByTitlePrefix("Kitchen faucet");
  const req4 = reqByTitlePrefix("Smoke detector");
  const req5 = reqByTitlePrefix("Garage door");
  const req6 = reqByTitlePrefix("Bathroom GFCI");

  type WoInsert = Database["public"]["Tables"]["work_orders"]["Insert"];
  const woInserts: WoInsert[] = [
    {
      organization_id: orgId,
      maintenance_request_id: req3,
      property_id: david.propertyId,
      unit_id: david.unitId,
      title: "Kitchen faucet leak — under-sink",
      description: "Lone Star Plumbing dispatched to identify and repair the leak under the kitchen sink.",
      category: "plumbing",
      priority: "medium",
      status: "in_progress",
      assignee_type: "vendor",
      assigned_vendor_id: vendors.plumbing,
      scheduled_for: isoDaysAgo(2),
      created_at: isoDaysAgo(5),
      updated_at: isoDaysAgo(2),
    },
    {
      organization_id: orgId,
      maintenance_request_id: req4,
      property_id: alex.propertyId,
      unit_id: alex.unitId,
      title: "Replace hallway smoke detector",
      description: "North Texas Handyman dispatched to replace chirping smoke detector unit.",
      category: "electrical",
      priority: "low",
      status: "in_progress",
      assignee_type: "vendor",
      assigned_vendor_id: vendors.handyman,
      scheduled_for: isoDaysAgo(0),
      created_at: isoDaysAgo(2),
      updated_at: isoDaysAgo(1),
    },
    {
      organization_id: orgId,
      maintenance_request_id: req5,
      property_id: sarah.propertyId,
      unit_id: sarah.unitId,
      title: "Garage door alignment repair",
      description: "North Texas Handyman realigned garage door sensors and replaced obstruction switch.",
      category: "general",
      priority: "medium",
      status: "completed",
      assignee_type: "vendor",
      assigned_vendor_id: vendors.handyman,
      created_at: isoDaysAgo(21),
      updated_at: isoDaysAgo(14),
      completed_at: isoDaysAgo(14),
      cost_actual: 185.0,
    },
    {
      organization_id: orgId,
      maintenance_request_id: req6,
      property_id: emily.propertyId,
      unit_id: emily.unitId,
      title: "Replace bathroom GFCI outlet",
      description: "North Texas Handyman replaced tripped GFCI outlet in master bathroom.",
      category: "electrical",
      priority: "medium",
      status: "completed",
      assignee_type: "vendor",
      assigned_vendor_id: vendors.handyman,
      created_at: isoDaysAgo(14),
      updated_at: isoDaysAgo(7),
      completed_at: isoDaysAgo(7),
      cost_actual: 95.0,
    },
  ];
  const insertedWos = await expectMany(
    "insert work_orders",
    supabase.from("work_orders").insert(woInserts).select("id, title"),
  );
  log("✓ work_orders inserted", `${insertedWos.length} (2 completed with completed_at)`);

  const wo5 = insertedWos.find((w) => w.title.startsWith("Garage"))!.id;
  const wo6 = insertedWos.find((w) => w.title.startsWith("Replace bathroom"))!.id;

  // Vendor ratings: 2 work-order-linked + 6 historical (work_order_id=null).
  type RatingInsert = Database["public"]["Tables"]["vendor_ratings"]["Insert"];
  const ratingInserts: RatingInsert[] = [
    // Work-order-linked
    {
      organization_id: orgId,
      vendor_id: vendors.handyman,
      work_order_id: wo5,
      rating: 5,
      review: "Quick fix, very professional. Garage door working better than before.",
      rated_by: MANAGER_AUTH_ID,
      created_at: isoDaysAgo(14),
    },
    {
      organization_id: orgId,
      vendor_id: vendors.handyman,
      work_order_id: wo6,
      rating: 4,
      review: "Replaced GFCI cleanly. Took a day longer than originally estimated.",
      rated_by: MANAGER_AUTH_ID,
      created_at: isoDaysAgo(7),
    },
    // Historical, work_order_id = null (rated against past jobs)
    {
      organization_id: orgId,
      vendor_id: vendors.hvac,
      work_order_id: null,
      rating: 5,
      review: "Excellent same-day response on a refrigerant top-up.",
      rated_by: MANAGER_AUTH_ID,
      created_at: isoDaysAgo(45),
    },
    {
      organization_id: orgId,
      vendor_id: vendors.hvac,
      work_order_id: null,
      rating: 4,
      review: "Good work on compressor replacement. Slightly over budget.",
      rated_by: MANAGER_AUTH_ID,
      created_at: isoDaysAgo(75),
    },
    {
      organization_id: orgId,
      vendor_id: vendors.plumbing,
      work_order_id: null,
      rating: 4,
      review: "Reliable on standard repairs.",
      rated_by: MANAGER_AUTH_ID,
      created_at: isoDaysAgo(60),
    },
    {
      organization_id: orgId,
      vendor_id: vendors.plumbing,
      work_order_id: null,
      rating: 3,
      review: "Took 4 days to schedule a routine job. Outcome was fine but communication was slow.",
      rated_by: MANAGER_AUTH_ID,
      created_at: isoDaysAgo(85),
    },
    {
      organization_id: orgId,
      vendor_id: vendors.handyman,
      work_order_id: null,
      rating: 5,
      review: "Versatile crew, handles small jobs efficiently.",
      rated_by: MANAGER_AUTH_ID,
      created_at: isoDaysAgo(40),
    },
    {
      organization_id: orgId,
      vendor_id: vendors.handyman,
      work_order_id: null,
      rating: 5,
      review: "Painted a unit turn in one day; clean finish.",
      rated_by: MANAGER_AUTH_ID,
      created_at: isoDaysAgo(70),
    },
  ];
  await expectMany(
    "insert vendor_ratings",
    supabase.from("vendor_ratings").insert(ratingInserts).select("id"),
  );
  log(
    "✓ vendor_ratings inserted",
    `${ratingInserts.length} (2 work-order-linked + 6 historical)`,
  );
}

// ==========================================================================
// Phase 11 — Property owners (Margaret → Maple + Riverside; NOT Oak)
// ==========================================================================

async function seedPropertyOwners(
  orgId: string,
  portfolio: Portfolio,
): Promise<void> {
  const { error } = await supabase.from("property_owners").insert([
    {
      organization_id: orgId,
      user_id: OWNER_AUTH_ID,
      property_id: portfolio.maple.id,
      created_by: MANAGER_AUTH_ID,
    },
    {
      organization_id: orgId,
      user_id: OWNER_AUTH_ID,
      property_id: portfolio.riverside.id,
      created_by: MANAGER_AUTH_ID,
    },
    // Margaret is NOT linked to Oak Street — deliberate. Proves the owner
    // portal correctly scopes (she sees Maple + Riverside; Oak is invisible).
  ]);
  if (error) throw new Error(`property_owners: ${JSON.stringify(error)}`);
  log(
    "✓ property_owners inserted",
    "Margaret → Maple Heights + Riverside Lofts (NOT Oak Street, by design)",
  );
}

// ==========================================================================
// Verify counts
// ==========================================================================

async function verifyCounts(orgId: string): Promise<void> {
  async function expectCount(label: string, q: PromiseLike<{ count: number | null; error: unknown }>, expected: number) {
    const { count, error } = await q;
    if (error) throw new Error(`verify ${label}: ${JSON.stringify(error)}`);
    const actual = count ?? 0;
    if (actual !== expected) {
      throw new Error(`verify ${label}: expected ${expected}, got ${actual}`);
    }
  }
  await expectCount("properties", supabase.from("properties").select("id", { count: "exact", head: true }).eq("organization_id", orgId), 3);
  await expectCount("buildings", supabase.from("buildings").select("id", { count: "exact", head: true }).eq("organization_id", orgId), 3);
  await expectCount("units", supabase.from("units").select("id", { count: "exact", head: true }).eq("organization_id", orgId), 20);
  await expectCount("leases", supabase.from("leases").select("id", { count: "exact", head: true }).eq("organization_id", orgId), 15);
  await expectCount("tenants", supabase.from("tenants").select("id", { count: "exact", head: true }).eq("organization_id", orgId), 15);
  await expectCount("rent_charges", supabase.from("rent_charges").select("id", { count: "exact", head: true }).eq("organization_id", orgId), 45);
  await expectCount("payments", supabase.from("payments").select("id", { count: "exact", head: true }).eq("organization_id", orgId), 45);
  await expectCount("maintenance_requests", supabase.from("maintenance_requests").select("id", { count: "exact", head: true }).eq("organization_id", orgId), 7);
  await expectCount("work_orders", supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("organization_id", orgId), 4);
  await expectCount("vendors", supabase.from("vendors").select("id", { count: "exact", head: true }).eq("organization_id", orgId), 3);
  await expectCount("vendor_ratings", supabase.from("vendor_ratings").select("id", { count: "exact", head: true }).eq("organization_id", orgId), 8);
  await expectCount("property_owners", supabase.from("property_owners").select("id", { count: "exact", head: true }).eq("organization_id", orgId), 2);
  await expectCount("user_roles", supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("organization_id", orgId), 3);
  log("✓ verified", "all 13 row counts match expected");
}

// ==========================================================================
// Main
// ==========================================================================

async function main(): Promise<void> {
  log("=== Demo seed start ===");
  log(`target`, `${SUPABASE_URL}`);

  const preflight = await preflightUsers();
  const orgId = await resolveSterlingOrgId();
  verifyUserOrgConsistency(orgId, preflight);
  await cleanupSterlingChildren(orgId);
  await bindUsersAndRoles(orgId);
  const portfolio = await seedPropertiesBuildingsUnits(orgId);
  const vendors = await seedVendors(orgId);
  const leased = await seedLeasesAndTenants(orgId, portfolio);
  await seedRentChargesAndPayments(orgId, leased);
  await seedMaintenanceAndWorkOrders(orgId, leased, vendors);
  await seedPropertyOwners(orgId, portfolio);
  await verifyCounts(orgId);

  log("=== Demo seed complete ===");
}

main().catch((err) => {
  console.error("\nFATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});

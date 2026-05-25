import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import type { NavSection } from "@/components/layout/nav";
import {
  isInvestorUser,
  isStaff,
  isTenantUser,
  isVendorUser,
} from "@/lib/auth/roles";
import { getOwnerPortalAccess } from "@/lib/auth/permissions";
import { getAuthUser, getSessionContext } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await getSessionContext();

  if (!context) {
    // Signed in but no organization yet -> onboarding. Otherwise -> login.
    const user = await getAuthUser();
    redirect(user ? "/onboarding" : "/login");
  }

  // Vendor-portal users do not belong in the internal app.
  if (isVendorUser(context.roles)) {
    redirect("/vendor-portal");
  }

  // Tenant-portal users do not belong in the internal app.
  if (isTenantUser(context.roles)) {
    redirect("/portal/welcome");
  }

  // INVESTOR-only users (no staff role) belong in the owner portal.
  // Dual-mode users with both staff + INVESTOR keep /app as their default
  // landing and switch to /owner-portal via the topbar menu affordance.
  if (isInvestorUser(context.roles) && !isStaff(context.roles)) {
    redirect("/owner-portal");
  }

  // Compute the dual-mode affordance: show "Switch to owner portal" in the
  // user menu AND the sidebar Portals section if this staff user holds an
  // INVESTOR role OR has at least one property_owners row.
  const showOwnerPortalLink = isStaff(context.roles)
    ? await getOwnerPortalAccess(context)
    : false;

  // Slice 11e Promote-Both: surface the affordance in the sidebar as a
  // dedicated "Portals" section. The user menu link stays in place too —
  // both affordances coexist so dropdown-trained users don't regress.
  // icon is a STRING key (not the LucideIcon component) — function
  // references cannot be serialized across the Server → Client Component
  // boundary. NavLinks resolves the key via its ICON_MAP at render time.
  const navExtras: NavSection[] = showOwnerPortalLink
    ? [
        {
          title: "Portals",
          items: [
            {
              label: "Owner Portal",
              href: "/owner-portal",
              icon: "briefcase",
              enabled: true,
            },
          ],
        },
      ]
    : [];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar and Topbar are hidden during print so statement pages
          (and any future print-styled surfaces) render edge-to-edge.
          Print precedent set in slice 10d. */}
      <div className="print:hidden">
        <Sidebar extras={navExtras} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="print:hidden">
          <Topbar
            context={context}
            showOwnerPortalLink={showOwnerPortalLink}
            navExtras={navExtras}
          />
        </div>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}

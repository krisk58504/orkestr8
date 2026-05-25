import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import {
  isInvestorUser,
  isStaff,
  isTenantUser,
  isVendorUser,
} from "@/lib/auth/roles";
import { getAuthUser, getSessionContext } from "@/lib/auth/session";
import { hasAnyPropertyOwnership } from "@/lib/data/property-owners";

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
  // user menu if this staff user holds an INVESTOR role OR has at least
  // one property_owners row.
  const showOwnerPortalLink = isStaff(context.roles)
    ? isInvestorUser(context.roles) ||
      (await hasAnyPropertyOwnership(
        context.authUserId,
        context.organization.id,
      ))
    : false;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar context={context} showOwnerPortalLink={showOwnerPortalLink} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

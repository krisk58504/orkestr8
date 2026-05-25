import { redirect } from "next/navigation";
import { Briefcase } from "lucide-react";
import { OwnerPortalNav } from "@/components/owner-portal/owner-portal-nav";
import { OwnerUserMenu } from "@/components/owner-portal/owner-user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  isInvestorUser,
  isStaff,
  isTenantUser,
  isVendorUser,
} from "@/lib/auth/roles";
import { getAuthUser, getSessionContext } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/constants";
import { hasAnyPropertyOwnership } from "@/lib/data/property-owners";

export default async function OwnerPortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await getSessionContext();

  if (!context) {
    const user = await getAuthUser();
    redirect(user ? "/onboarding" : "/login");
  }

  // Admission: INVESTOR role OR has at least one property_owners row.
  // Identity-agnostic per §0.5 decision 4 — supports dual-mode access.
  const isInvestor = isInvestorUser(context.roles);
  const hasOwnership = isInvestor
    ? true // Skip the DB query for INVESTOR users — they're admitted regardless of ownership rows.
    : await hasAnyPropertyOwnership(
        context.authUserId,
        context.organization.id,
      );

  if (!isInvestor && !hasOwnership) {
    // Not eligible for owner portal — redirect to their natural landing.
    if (isVendorUser(context.roles)) redirect("/vendor-portal");
    if (isTenantUser(context.roles)) redirect("/portal/welcome");
    redirect("/dashboard");
  }

  const name = context.profile.full_name?.trim() || context.email;
  const orgName = context.organization.name;
  const primaryRole = context.roles[0];
  const roleLabel = primaryRole ? ROLE_LABELS[primaryRole] : "Owner";
  const userIsStaff = isStaff(context.roles);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Briefcase className="size-5 shrink-0" />
            <span className="truncate font-semibold">{orgName}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Owner Portal
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <OwnerUserMenu
              name={name}
              email={context.email}
              contextLabel={`${orgName} · ${roleLabel}`}
              showStaffAppLink={userIsStaff}
            />
          </div>
        </div>
        <div className="px-4 pb-2 sm:px-6">
          <OwnerPortalNav />
        </div>
      </header>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

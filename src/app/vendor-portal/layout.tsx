import { redirect } from "next/navigation";
import { Truck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { VendorPortalNav } from "@/components/vendor-portal/vendor-portal-nav";
import { VendorUserMenu } from "@/components/vendor-portal/vendor-user-menu";
import { isVendorUser } from "@/lib/auth/roles";
import { getAuthUser, getSessionContext } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/constants";
import { getVendorCompany } from "@/lib/data/vendor-portal";

export default async function VendorPortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await getSessionContext();

  if (!context) {
    // Signed in but no organization yet -> onboarding. Otherwise -> login.
    const user = await getAuthUser();
    redirect(user ? "/onboarding" : "/login");
  }

  // Internal staff do not belong in the vendor portal.
  if (!isVendorUser(context.roles)) {
    redirect("/dashboard");
  }

  const name = context.profile.full_name?.trim() || context.email;
  const primaryRole = context.roles[0];
  const roleLabel = primaryRole ? ROLE_LABELS[primaryRole] : "Vendor";

  // A vendor-portal user with no linked vendor company has nothing to show.
  if (!context.vendorId) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4 sm:px-6">
          <Truck className="size-5" />
          <span className="font-semibold">Vendor Portal</span>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-16">
          <div className="max-w-md text-center">
            <h1 className="text-lg font-semibold">
              Your account is not linked to a vendor company
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask the property-management team that invited you to link your
              account to their vendor record. Once linked, your assigned work
              orders, invoices, and documents will appear here.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const vendor = await getVendorCompany(context.vendorId);
  const vendorName = vendor?.name ?? "Your company";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Truck className="size-5 shrink-0" />
            <span className="truncate font-semibold">{vendorName}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Vendor Portal
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <VendorUserMenu
              name={name}
              email={context.email}
              vendorName={vendorName}
              roleLabel={roleLabel}
            />
          </div>
        </div>
        <div className="px-4 pb-2 sm:px-6">
          <VendorPortalNav />
        </div>
      </header>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

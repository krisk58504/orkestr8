import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { isTenantUser, isVendorUser } from "@/lib/auth/roles";
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

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar context={context} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

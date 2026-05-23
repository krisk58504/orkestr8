import { redirect } from "next/navigation";
import { Home } from "lucide-react";
import { PortalNav } from "@/components/portal/portal-nav";
import { PortalUserMenu } from "@/components/portal/portal-user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { isTenantUser } from "@/lib/auth/roles";
import { getAuthUser, getSessionContext } from "@/lib/auth/session";

export default async function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await getSessionContext();

  if (!context) {
    const user = await getAuthUser();
    redirect(user ? "/onboarding" : "/login");
  }

  // Only tenant-portal users belong here.
  if (!isTenantUser(context.roles)) {
    redirect("/dashboard");
  }

  const name = context.profile.full_name?.trim() || context.email;
  const orgName = context.organization.name;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Home className="size-5 shrink-0" />
            <span className="truncate font-semibold">{orgName}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Tenant Portal
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <PortalUserMenu
              name={name}
              email={context.email}
              contextLabel={`${orgName} · Tenant`}
            />
          </div>
        </div>
        <div className="px-4 pb-2 sm:px-6">
          <PortalNav />
        </div>
      </header>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { ROLE_LABELS } from "@/lib/constants";
import type { SessionContext } from "@/lib/types/app";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";

export function Topbar({ context }: { context: SessionContext }) {
  const name = context.profile.full_name?.trim() || context.email;
  const primaryRole = context.roles[0];

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-6">
      <MobileNav />

      <div className="relative hidden w-full max-w-sm sm:block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search…"
          className="pl-8"
          aria-label="Search"
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="size-5" />
        </Button>
        <ThemeToggle />
        <UserMenu
          name={name}
          email={context.email}
          orgName={context.organization.name}
          roleLabel={primaryRole ? ROLE_LABELS[primaryRole] : "Member"}
        />
      </div>
    </header>
  );
}

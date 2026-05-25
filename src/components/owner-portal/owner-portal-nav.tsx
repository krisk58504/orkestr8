"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, PieChart, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type OwnerNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  enabled: boolean;
};

const OWNER_NAV_ITEMS: OwnerNavItem[] = [
  { label: "Portfolio", href: "/owner-portal", icon: Briefcase, enabled: true },
  {
    label: "Reports",
    href: "/owner-portal/reports",
    icon: PieChart,
    enabled: true,
  },
];

export function OwnerPortalNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {OWNER_NAV_ITEMS.map((item) => {
        const active =
          item.href === "/owner-portal"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        if (!item.enabled) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground/60"
              title="Coming soon"
            >
              <Icon className="size-4" />
              {item.label}
              <span className="text-xs">Soon</span>
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

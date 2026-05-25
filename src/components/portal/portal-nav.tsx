"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCard,
  Home,
  MessageSquare,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PortalNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const PORTAL_NAV_ITEMS: PortalNavItem[] = [
  { label: "Welcome", href: "/portal/welcome", icon: Home },
  { label: "Rent", href: "/portal/rent", icon: CreditCard },
  { label: "Maintenance", href: "/portal/maintenance", icon: Wrench },
  { label: "Messages", href: "/portal/messages", icon: MessageSquare },
];

export function PortalNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {PORTAL_NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
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

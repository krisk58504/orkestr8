"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  FileText,
  Folder,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type VendorNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const VENDOR_NAV_ITEMS: VendorNavItem[] = [
  { label: "Dashboard", href: "/vendor-portal", icon: LayoutDashboard },
  {
    label: "Work Orders",
    href: "/vendor-portal/work-orders",
    icon: ClipboardList,
  },
  { label: "Invoices", href: "/vendor-portal/invoices", icon: FileText },
  { label: "Documents", href: "/vendor-portal/documents", icon: Folder },
];

export function VendorPortalNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {VENDOR_NAV_ITEMS.map((item) => {
        // Dashboard matches only the exact root; the rest match their subtree.
        const active =
          item.href === "/vendor-portal"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
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

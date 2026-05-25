"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, type NavItem, type NavSection } from "./nav";

/**
 * Resolves a string icon key to a LucideIcon component. Used when
 * NavItem.icon is a string (passed from a Server Component via the
 * `extras` prop — function references cannot cross the RSC boundary).
 * Extend this map when adding new dynamic nav items.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  briefcase: Briefcase,
};

function resolveIcon(icon: NavItem["icon"]): LucideIcon | null {
  if (typeof icon === "string") return ICON_MAP[icon] ?? null;
  return icon;
}

export function NavLinks({
  onNavigate,
  extras,
}: {
  onNavigate?: () => void;
  /**
   * Per-request dynamic sections appended after the static NAV_SECTIONS.
   * Slice 11e Promote-Both: the "Portals" section is computed in the
   * layout when the user has owner-portal access and passed in here so
   * the static nav stays static and the dynamic gating lives in the
   * server layout.
   */
  extras?: NavSection[];
}) {
  const pathname = usePathname();
  const sections: NavSection[] = extras && extras.length > 0
    ? [...NAV_SECTIONS, ...extras]
    : NAV_SECTIONS;

  return (
    <nav className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = resolveIcon(item.icon);
              const active =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);

              if (!Icon) return null;

              if (!item.enabled) {
                return (
                  <li key={item.href}>
                    <span className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/50">
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                      <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Soon
                      </span>
                    </span>
                  </li>
                );
              }

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-bg-active font-medium text-sidebar-ink-active [&_svg]:text-sidebar-icon-active"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

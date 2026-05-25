/**
 * nav.ts — sidebar navigation definition.
 *
 * `enabled: false` items are part of the product roadmap (later phases) and
 * render as disabled "Soon" entries so the full information architecture is
 * visible without dead links.
 */
import {
  Building,
  Building2,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  DoorOpen,
  FileCheck,
  FileText,
  Folder,
  LayoutDashboard,
  MessageSquare,
  PieChart,
  Settings,
  Sparkles,
  Truck,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * NavItem.icon accepts either a LucideIcon component (used by the
 * static NAV_SECTIONS below — bundled with the client component) OR
 * a string key (used by per-request dynamic items passed in via the
 * `extras` prop from a server component, which cannot serialize
 * function references across the RSC boundary).
 *
 * String keys resolve via ICON_MAP inside nav-links.tsx.
 */
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon | string;
  enabled: boolean;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, enabled: true },
    ],
  },
  {
    title: "Portfolio",
    items: [
      { label: "Properties", href: "/properties", icon: Building2, enabled: true },
      { label: "Buildings", href: "/buildings", icon: Building, enabled: true },
      { label: "Units", href: "/units", icon: DoorOpen, enabled: true },
      { label: "Tenants", href: "/tenants", icon: Users, enabled: true },
      { label: "Leases", href: "/leases", icon: FileText, enabled: true },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Maintenance", href: "/maintenance", icon: Wrench, enabled: true },
      { label: "Work Orders", href: "/work-orders", icon: ClipboardList, enabled: true },
      { label: "Vendors", href: "/vendors", icon: Truck, enabled: true },
      { label: "Inspections", href: "/inspections", icon: ClipboardCheck, enabled: false },
    ],
  },
  {
    title: "Leasing",
    items: [
      { label: "Leasing", href: "/leasing", icon: UserPlus, enabled: true },
      { label: "Applications", href: "/applications", icon: FileCheck, enabled: true },
    ],
  },
  {
    title: "Engagement",
    items: [
      { label: "Messages", href: "/messages", icon: MessageSquare, enabled: true },
      { label: "Amenities", href: "/amenities", icon: Sparkles, enabled: false },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Payments", href: "/payments", icon: CreditCard, enabled: true },
      { label: "Reports", href: "/reports", icon: PieChart, enabled: true },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Documents", href: "/documents", icon: Folder, enabled: false },
      { label: "Settings", href: "/settings", icon: Settings, enabled: true },
    ],
  },
];

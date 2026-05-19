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

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
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
      { label: "Leases", href: "/leases", icon: FileText, enabled: false },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Maintenance", href: "/maintenance", icon: Wrench, enabled: false },
      { label: "Work Orders", href: "/work-orders", icon: ClipboardList, enabled: false },
      { label: "Vendors", href: "/vendors", icon: Truck, enabled: false },
      { label: "Inspections", href: "/inspections", icon: ClipboardCheck, enabled: false },
    ],
  },
  {
    title: "Leasing",
    items: [
      { label: "Leasing CRM", href: "/leasing", icon: UserPlus, enabled: false },
      { label: "Applications", href: "/applications", icon: FileCheck, enabled: false },
    ],
  },
  {
    title: "Engagement",
    items: [
      { label: "Communications", href: "/communications", icon: MessageSquare, enabled: false },
      { label: "Amenities", href: "/amenities", icon: Sparkles, enabled: false },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Payments", href: "/payments", icon: CreditCard, enabled: false },
      { label: "Reports", href: "/reports", icon: PieChart, enabled: false },
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

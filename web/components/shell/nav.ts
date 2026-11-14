import {
  CalendarClock,
  ClipboardCheck,
  FileClock,
  FolderKanban,
  Gauge,
  History,
  LayoutDashboard,
  MonitorSmartphone,
  Radio,
  ScrollText,
  Settings,
  Timer,
  Users,
  Wallet,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

const ALL: Role[] = ["CEO_ADMIN", "PROJECT_MANAGER", "EMPLOYEE"];
const MGMT: Role[] = ["CEO_ADMIN", "PROJECT_MANAGER"];
const CEO: Role[] = ["CEO_ADMIN"];

/** Everyone tracks their own time; management also gets the company views. Routing is not security: the API decides. */
export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "My work",
    items: [
      { href: "/today", label: "Today", icon: Timer, roles: ALL },
      { href: "/my-time", label: "My time", icon: History, roles: ALL },
      { href: "/my-projects", label: "My projects", icon: FolderKanban, roles: ALL },
      { href: "/my-corrections", label: "My corrections", icon: FileClock, roles: ALL },
    ],
  },
  {
    section: "Manage",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: MGMT },
      { href: "/live", label: "Live status", icon: Radio, roles: MGMT },
      { href: "/employees", label: "Employees", icon: Users, roles: MGMT },
      { href: "/projects", label: "Projects", icon: Gauge, roles: MGMT },
      { href: "/corrections", label: "Corrections", icon: ClipboardCheck, roles: MGMT },
      { href: "/reports", label: "Reports", icon: BarChart3, roles: MGMT },
      { href: "/evidence", label: "Work evidence", icon: MonitorSmartphone, roles: MGMT },
      { href: "/audit", label: "Audit log", icon: ScrollText, roles: MGMT },
    ],
  },
  {
    section: "Company",
    items: [
      { href: "/payroll", label: "Payroll", icon: Wallet, roles: CEO },
      { href: "/settings", label: "Settings", icon: Settings, roles: CEO },
    ],
  },
];

/** Profile is reachable from the user menu rather than the sidebar. */
export const EXTRA_ROUTES: NavItem[] = [{ href: "/profile", label: "Profile", icon: CalendarClock, roles: ALL }];

export const navFor = (role: Role) =>
  NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length > 0);

export const routeFor = (pathname: string) =>
  [...NAV.flatMap((g) => g.items), ...EXTRA_ROUTES].find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));

import {
  CalendarClock,
  ClipboardCheck,
  FilePen,
  Briefcase,
  Activity,
  CalendarDays,
  FolderKanban,
  LayoutDashboard,
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
      { href: "/today", label: "Punch clock", icon: Timer, roles: ALL },
      { href: "/my-time", label: "My timesheets", icon: CalendarDays, roles: ALL },
      { href: "/my-projects", label: "My projects", icon: FolderKanban, roles: ALL },
      { href: "/my-corrections", label: "Fix my hours", icon: FilePen, roles: ALL },
    ],
  },
  {
    section: "My team",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, roles: MGMT },
      { href: "/live", label: "Who's working now", icon: Radio, roles: MGMT },
      { href: "/employees", label: "Employee directory", icon: Users, roles: MGMT },
      { href: "/projects", label: "Projects & teams", icon: Briefcase, roles: MGMT },
      { href: "/corrections", label: "Approve hour fixes", icon: ClipboardCheck, roles: MGMT },
      { href: "/reports", label: "Hours reports", icon: BarChart3, roles: MGMT },
      { href: "/evidence", label: "Hours vs activity", icon: Activity, roles: MGMT },
      { href: "/audit", label: "Change history", icon: ScrollText, roles: MGMT },
    ],
  },
  {
    section: "Company",
    items: [
      { href: "/payroll", label: "Payroll", icon: Wallet, roles: CEO },
      { href: "/settings", label: "Company settings", icon: Settings, roles: CEO },
    ],
  },
];

/** Profile is reachable from the user menu rather than the sidebar. */
export const EXTRA_ROUTES: NavItem[] = [{ href: "/profile", label: "Profile", icon: CalendarClock, roles: ALL }];

export const navFor = (role: Role) =>
  NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length > 0);

export const routeFor = (pathname: string) =>
  [...NAV.flatMap((g) => g.items), ...EXTRA_ROUTES].find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));

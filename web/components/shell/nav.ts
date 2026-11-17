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
import { can, type PermissionKey, type Scope } from "@/lib/permissions";
import type { Me } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown when the person holds any of these (at `atLeast` scope for scoped keys). Omit for everyone. */
  permission?: PermissionKey | PermissionKey[];
  atLeast?: Scope;
}

/** Each page appears for whoever holds its permission. Routing is not security: the API decides. */
export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "My work",
    items: [
      { href: "/today", label: "Punch clock", icon: Timer, permission: "time.track" },
      { href: "/my-time", label: "My timesheets", icon: CalendarDays, permission: "timesheets.view" },
      { href: "/my-projects", label: "My projects", icon: FolderKanban, permission: "projects.view" },
      { href: "/my-corrections", label: "Fix my hours", icon: FilePen, permission: "corrections.request" },
    ],
  },
  {
    section: "My team",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, permission: "dashboard.view" },
      { href: "/live", label: "Who's working now", icon: Radio, permission: "live.view" },
      { href: "/employees", label: "Employee directory", icon: Users, permission: "employees.view", atLeast: "TEAM" },
      { href: "/projects", label: "Projects & teams", icon: Briefcase, permission: ["projects.manage", "reports.view"] },
      { href: "/corrections", label: "Approve hour fixes", icon: ClipboardCheck, permission: "corrections.review", atLeast: "TEAM" },
      { href: "/reports", label: "Hours reports", icon: BarChart3, permission: "reports.view" },
      { href: "/evidence", label: "Hours vs activity", icon: Activity, permission: "evidence.view", atLeast: "TEAM" },
      { href: "/audit", label: "Change history", icon: ScrollText, permission: "audit.view" },
    ],
  },
  {
    section: "Company",
    items: [
      { href: "/payroll", label: "Payroll", icon: Wallet, permission: ["payroll.view", "payroll.manage"] },
      { href: "/settings", label: "Company settings", icon: Settings, permission: ["settings.departments", "settings.positions", "settings.devices"] },
    ],
  },
];

/** Profile is reachable from the user menu rather than the sidebar. */
export const EXTRA_ROUTES: NavItem[] = [{ href: "/profile", label: "Profile", icon: CalendarClock }];

/** True when the person may open this page. */
export const canOpen = (me: Me, item: NavItem) =>
  !item.permission || (Array.isArray(item.permission) ? item.permission : [item.permission]).some((k) => can(me, k, item.atLeast));

export const navFor = (me: Me) =>
  NAV.map((g) => ({ ...g, items: g.items.filter((i) => canOpen(me, i)) })).filter((g) => g.items.length > 0);

export const routeFor = (pathname: string) =>
  [...NAV.flatMap((g) => g.items), ...EXTRA_ROUTES].find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));

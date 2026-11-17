import type { Me } from "./types";

/** Mirrors server/src/auth/permissions.ts. The API checks every request; the web only hides what would be refused. */
export type PermissionKey =
  | "time.track"
  | "timesheets.view"
  | "corrections.request"
  | "corrections.review"
  | "projects.view"
  | "projects.manage"
  | "projects.delete"
  | "projects.appointLead"
  | "employees.view"
  | "employees.manage"
  | "compensation.view"
  | "compensation.manage"
  | "dashboard.view"
  | "live.view"
  | "reports.view"
  | "evidence.view"
  | "audit.view"
  | "payroll.view"
  | "payroll.manage"
  | "settings.departments"
  | "settings.positions"
  | "settings.devices"
  | "roles.manage";

export type Scope = "OWN" | "TEAM" | "ALL";
export type Grant = Scope | true;
export type Grants = Partial<Record<PermissionKey, Grant>>;

const RANK: Record<Scope, number> = { OWN: 1, TEAM: 2, ALL: 3 };

/** True when `me` holds the permission (at least `atLeast` for scoped keys). */
export const can = (me: Pick<Me, "permissions"> | null | undefined, key: PermissionKey, atLeast?: Scope) => {
  const g = me?.permissions?.[key];
  if (!g) return false;
  if (!atLeast || g === true) return true;
  return RANK[g] >= RANK[atLeast];
};

/** The scope held for a scoped key, or null. */
export const scopeOf = (me: Pick<Me, "permissions"> | null | undefined, key: PermissionKey): Scope | null => {
  const g = me?.permissions?.[key];
  return !g ? null : g === true ? "ALL" : g;
};

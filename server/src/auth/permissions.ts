import { PermissionScope, Role } from '@prisma/client';
import { DbClient } from '../config/prisma';

/**
 * The permission catalog: every key the API checks, in plain words for the admin screen.
 * Scoped keys carry whose data they cover: OWN (just me), TEAM (people on projects I lead), ALL.
 * This file is the single source; the web reads it from GET /roles/catalog.
 */
export const CATALOG = [
  { key: 'time.track', module: 'My work', label: 'Track their own time (Punch clock, My timesheets, My projects, Fix my hours)', scoped: false },
  { key: 'timesheets.view', module: 'Timesheets', label: 'See recorded workdays and hours', scoped: true },
  { key: 'corrections.request', module: 'Hour fixes', label: 'Ask for a fix to their own hours', scoped: false },
  { key: 'corrections.review', module: 'Hour fixes', label: 'Approve or reject hour fixes', scoped: true },
  { key: 'projects.view', module: 'Projects', label: 'See projects', scoped: true },
  { key: 'projects.manage', module: 'Projects', label: 'Create and edit projects, add or remove people', scoped: true },
  { key: 'projects.delete', module: 'Projects', label: 'Delete projects', scoped: false },
  { key: 'projects.appointLead', module: 'Projects', label: 'Make someone a project lead, or remove a lead', scoped: false },
  { key: 'employees.view', module: 'People', label: 'See the employee directory and profiles', scoped: true },
  { key: 'employees.manage', module: 'People', label: 'Add, edit and deactivate people, reset passwords', scoped: false },
  { key: 'compensation.view', module: 'Money', label: 'See pay rates and labour costs', scoped: false },
  { key: 'compensation.manage', module: 'Money', label: 'Change pay rates', scoped: false },
  { key: 'dashboard.view', module: 'Team views', label: 'Overview dashboard', scoped: true },
  { key: 'live.view', module: 'Team views', label: "Who's working now", scoped: true },
  { key: 'reports.view', module: 'Team views', label: 'Hours reports and estimates', scoped: true },
  { key: 'evidence.view', module: 'Team views', label: 'Hours vs activity (device evidence)', scoped: true },
  { key: 'audit.view', module: 'Team views', label: 'Change history', scoped: true },
  { key: 'payroll.view', module: 'Payroll', label: 'See payroll', scoped: false },
  { key: 'payroll.manage', module: 'Payroll', label: 'Generate, finalize and export payroll', scoped: false },
  { key: 'settings.departments', module: 'Company settings', label: 'Add and rename departments', scoped: false },
  { key: 'settings.positions', module: 'Company settings', label: 'Add and rename positions', scoped: false },
  { key: 'settings.devices', module: 'Company settings', label: 'Register and revoke desktop devices', scoped: false },
  { key: 'roles.manage', module: 'Company settings', label: 'Manage roles and permissions', scoped: false },
] as const;

export type PermissionKey = (typeof CATALOG)[number]['key'];
/** A granted permission: the scope for scoped keys, true for plain ones. */
export type Grant = PermissionScope | true;
export type Grants = Partial<Record<PermissionKey, Grant>>;

const SCOPED = new Set<string>(CATALOG.filter((c) => c.scoped).map((c) => c.key));
export const isPermissionKey = (k: string): k is PermissionKey => CATALOG.some((c) => c.key === k);
export const isScoped = (k: string) => SCOPED.has(k);

const { OWN, TEAM, ALL } = PermissionScope;

/** Everything, everywhere. */
const everything = Object.fromEntries(CATALOG.map((c) => [c.key, c.scoped ? ALL : true])) as Grants;

/**
 * System presets: what each built-in role gets out of the box, matching how the app
 * behaved before roles were editable. "Reset to default" restores these.
 */
export const PRESETS: Record<Role, { key: string; name: string; description: string; grants: Grants }> = {
  CEO_ADMIN: {
    key: 'ceo_admin',
    name: 'CEO / Admin',
    description: 'Full access, including pay, payroll and company settings.',
    grants: everything,
  },
  PROJECT_MANAGER: {
    key: 'project_manager',
    name: 'Project manager',
    description: 'Runs the projects they lead and looks after the people on them. No pay or payroll.',
    grants: {
      'time.track': true,
      'corrections.request': true,
      'timesheets.view': TEAM,
      'corrections.review': TEAM,
      'projects.view': ALL,
      'projects.manage': TEAM,
      'employees.view': TEAM,
      'dashboard.view': TEAM,
      'live.view': TEAM,
      'reports.view': TEAM,
      'evidence.view': TEAM,
      'audit.view': OWN,
    },
  },
  EMPLOYEE: {
    key: 'employee',
    name: 'Employee',
    description: 'Tracks their own time and asks for fixes to it.',
    grants: {
      'time.track': true,
      'corrections.request': true,
      'timesheets.view': OWN,
      'projects.view': OWN,
    },
  },
};

export const systemRoleKey = (role: Role) => PRESETS[role].key;

/** Rows for RolePermission from a grant map (scope null for plain keys). */
export const grantRows = (roleId: string, grants: Grants) =>
  Object.entries(grants).map(([permission, g]) => ({ roleId, permission, scope: g === true ? null : (g as PermissionScope) }));

/**
 * Makes sure the three system roles exist and have permissions. A role with no rows yet
 * gets its preset; an existing role is left as the admin edited it. Safe to run on every boot.
 */
export const ensureSystemRoles = async (db: DbClient) => {
  for (const [presetOf, p] of Object.entries(PRESETS) as [Role, (typeof PRESETS)[Role]][]) {
    const role = await db.appRole.upsert({
      where: { key: p.key },
      create: { key: p.key, name: p.name, description: p.description, isSystem: true, presetOf },
      update: {},
      include: { _count: { select: { permissions: true } } },
    });
    if (role._count.permissions === 0) {
      await db.rolePermission.createMany({ data: grantRows(role.id, p.grants), skipDuplicates: true });
    }
  }
};

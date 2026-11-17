import { AuditAction, PermissionScope, Prisma } from '@prisma/client';
import { prisma, DbClient } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { AuthUser, can, toGrants } from '../../auth/can';
import { CATALOG, Grants, PRESETS, grantRows, isPermissionKey, isScoped } from '../../auth/permissions';

const RANK: Record<PermissionScope, number> = { OWN: 1, TEAM: 2, ALL: 3 };
const ADMIN_KEY = PRESETS.CEO_ADMIN.key;

const roleSelect = {
  id: true,
  key: true,
  name: true,
  description: true,
  isSystem: true,
  presetOf: true,
  permissions: { select: { permission: true, scope: true } },
  _count: { select: { users: { where: { isActive: true } } } },
} satisfies Prisma.AppRoleSelect;

type RoleRow = Prisma.AppRoleGetPayload<{ select: typeof roleSelect }>;

const shape = (r: RoleRow) => ({
  id: r.id,
  key: r.key,
  name: r.name,
  description: r.description,
  isSystem: r.isSystem,
  presetOf: r.presetOf,
  userCount: r._count.users,
  permissions: toGrants(r.permissions),
});

/** Validates a grant map from the client: catalog keys only, a scope for scoped keys, `true` for plain ones. */
export const parseGrants = (input: Record<string, unknown>): Grants => {
  const out: Grants = {};
  for (const [key, value] of Object.entries(input)) {
    if (!isPermissionKey(key)) throw AppError.badRequest(`Unknown permission '${key}'`);
    if (isScoped(key)) {
      if (value !== 'OWN' && value !== 'TEAM' && value !== 'ALL') throw AppError.badRequest(`'${key}' needs a scope: OWN, TEAM or ALL`);
      out[key] = value;
    } else {
      if (value !== true) throw AppError.badRequest(`'${key}' is on or off; send true to grant it`);
      out[key] = true;
    }
  }
  return out;
};

/**
 * Nobody hands out more than they have: without roles.manage, every permission in the
 * role must be one the actor holds at the same or a wider scope.
 */
export const assertCanAssign = (actor: AuthUser, grants: Grants) => {
  if (can(actor, 'roles.manage')) return;
  for (const [key, g] of Object.entries(grants)) {
    const mine = actor.grants[key as keyof Grants];
    const ok = mine && (g === true || mine === true || RANK[mine] >= RANK[g as PermissionScope]);
    if (!ok) throw AppError.forbidden('You can only give people a role with access you have yourself');
  }
};

/** At least one active person must always be able to manage roles, or nobody could fix a mistake. */
const assertSomeoneManagesRoles = async (tx: DbClient) => {
  const n = await tx.user.count({
    where: { isActive: true, appRole: { permissions: { some: { permission: 'roles.manage' } } } },
  });
  if (n === 0) throw AppError.conflict('At least one active person must keep "Manage roles and permissions"', 'LAST_ROLE_ADMIN');
};

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'role';

const audit = (tx: DbClient, actorId: string, action: AuditAction, roleId: string, beforeState?: unknown, afterState?: unknown) =>
  tx.auditLog.create({
    data: {
      actorId,
      action,
      entityName: 'Role',
      entityId: roleId,
      beforeState: beforeState as Prisma.InputJsonValue | undefined,
      afterState: afterState as Prisma.InputJsonValue | undefined,
    },
  });

export const roleService = {
  catalog: () => CATALOG,

  async list() {
    const roles = await prisma.appRole.findMany({ select: roleSelect, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
    return roles.map(shape);
  },

  async create(actor: AuthUser, input: { name: string; description?: string; copyFrom?: string; permissions?: Record<string, unknown> }) {
    let grants: Grants = {};
    if (input.permissions) grants = parseGrants(input.permissions);
    else if (input.copyFrom) {
      const from = await prisma.appRole.findUnique({ where: { id: input.copyFrom }, select: roleSelect });
      if (!from) throw AppError.notFound('Role to copy not found');
      grants = toGrants(from.permissions);
    }
    return prisma.$transaction(async (tx) => {
      let key = slug(input.name);
      if (await tx.appRole.findUnique({ where: { key } })) key = `${key}_${Date.now().toString(36)}`;
      const role = await tx.appRole.create({ data: { key, name: input.name, description: input.description } });
      await tx.rolePermission.createMany({ data: grantRows(role.id, grants) });
      await audit(tx, actor.userId, AuditAction.CREATE, role.id, undefined, { event: 'ROLE_CREATED', name: role.name, permissions: grants });
      return shape(await tx.appRole.findUniqueOrThrow({ where: { id: role.id }, select: roleSelect }));
    });
  },

  async update(actor: AuthUser, id: string, input: { name?: string; description?: string | null; permissions?: Record<string, unknown> }) {
    const before = await prisma.appRole.findUnique({ where: { id }, select: roleSelect });
    if (!before) throw AppError.notFound('Role not found');
    const grants = input.permissions ? parseGrants(input.permissions) : null;
    if (grants && before.key === ADMIN_KEY && !grants['roles.manage']) {
      throw AppError.badRequest('The CEO / Admin role always keeps "Manage roles and permissions"');
    }
    return prisma.$transaction(async (tx) => {
      await tx.appRole.update({ where: { id }, data: { name: input.name, description: input.description } });
      if (grants) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({ data: grantRows(id, grants) });
        await assertSomeoneManagesRoles(tx);
      }
      await audit(
        tx,
        actor.userId,
        AuditAction.UPDATE,
        id,
        { name: before.name, permissions: toGrants(before.permissions) },
        { event: 'ROLE_UPDATED', name: input.name ?? before.name, ...(grants ? { permissions: grants } : {}) },
      );
      return shape(await tx.appRole.findUniqueOrThrow({ where: { id }, select: roleSelect }));
    });
  },

  /** System roles only: back to the preset shipped in code. */
  async reset(actor: AuthUser, id: string) {
    const role = await prisma.appRole.findUnique({ where: { id }, select: roleSelect });
    if (!role) throw AppError.notFound('Role not found');
    if (!role.presetOf) throw AppError.badRequest('Only the built-in roles have a default to reset to');
    return this.update(actor, id, { permissions: PRESETS[role.presetOf].grants as Record<string, unknown> });
  },

  async remove(actor: AuthUser, id: string) {
    const role = await prisma.appRole.findUnique({ where: { id }, select: { ...roleSelect, _count: { select: { users: true } } } });
    if (!role) throw AppError.notFound('Role not found');
    if (role.isSystem) throw AppError.badRequest('Built-in roles cannot be deleted');
    if (role._count.users > 0) throw AppError.conflict('Move everyone to another role before deleting this one', 'ROLE_IN_USE');
    await prisma.$transaction(async (tx) => {
      await tx.appRole.delete({ where: { id } });
      await audit(tx, actor.userId, AuditAction.DELETE, id, { name: role.name, permissions: toGrants(role.permissions) }, { event: 'ROLE_DELETED' });
    });
    return { id };
  },

  /** Moves one person to another role. */
  async assign(actor: AuthUser, employeeId: string, roleId: string) {
    const [employee, role] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId }, select: { userId: true, user: { select: { roleId: true } } } }),
      prisma.appRole.findUnique({ where: { id: roleId }, select: roleSelect }),
    ]);
    if (!employee) throw AppError.notFound('Employee not found');
    if (!role) throw AppError.notFound('Role not found');
    assertCanAssign(actor, toGrants(role.permissions));
    return prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: employee.userId }, data: { roleId } });
      await assertSomeoneManagesRoles(tx);
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: AuditAction.UPDATE,
          entityName: 'User',
          entityId: employee.userId,
          beforeState: { roleId: employee.user.roleId },
          afterState: { event: 'ROLE_ASSIGNED', roleId, roleName: role.name },
        },
      });
      return { employeeId, role: { id: role.id, key: role.key, name: role.name } };
    });
  },
};

import { PermissionScope } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../errors/AppError';
import { AuthUser, scopeOf } from '../auth/can';
import { PermissionKey } from '../auth/permissions';

/** True when the employee leads the given project. */
export const pmLeadsProject = async (leadEmployeeId: string, projectId: string) =>
  (await prisma.projectMember.count({
    where: { projectId, employeeId: leadEmployeeId, isProjectLead: true, removedAt: null },
  })) > 0;

/** True when the employee is a member of any project the lead leads ("my team"). */
export const pmLeadsEmployee = async (leadEmployeeId: string, employeeId: string) =>
  (await prisma.projectMember.count({
    where: {
      employeeId,
      removedAt: null,
      project: { members: { some: { employeeId: leadEmployeeId, isProjectLead: true, removedAt: null } } },
    },
  })) > 0;

/**
 * Object-level check for data about one employee under a scoped permission:
 * yourself always; ALL anyone; TEAM people on projects you lead; otherwise 403.
 */
export const assertCanSee = async (user: AuthUser, key: PermissionKey | PermissionKey[], employeeId: string) => {
  if (user.employeeId === employeeId) return;
  // With several keys, the widest scope among them counts.
  const scopes = (Array.isArray(key) ? key : [key]).map((k) => scopeOf(user, k));
  const scope = scopes.includes(PermissionScope.ALL) ? PermissionScope.ALL : scopes.includes(PermissionScope.TEAM) ? PermissionScope.TEAM : null;
  if (scope === PermissionScope.ALL) return;
  if (scope === PermissionScope.TEAM && (await pmLeadsEmployee(user.employeeId, employeeId))) return;
  throw AppError.forbidden();
};

/**
 * Employees the user may see under a scoped permission: null = everyone (ALL),
 * otherwise an id list (TEAM: self + people on projects they lead; OWN or none: self).
 */
export const visibleEmployeeIds = async (user: AuthUser, key: PermissionKey): Promise<string[] | null> => {
  const scope = scopeOf(user, key);
  if (scope === PermissionScope.ALL) return null;
  if (scope !== PermissionScope.TEAM) return [user.employeeId];
  const members = await prisma.projectMember.findMany({
    where: {
      removedAt: null,
      project: { members: { some: { employeeId: user.employeeId, isProjectLead: true, removedAt: null } } },
    },
    select: { employeeId: true },
  });
  return [...new Set([user.employeeId, ...members.map((m) => m.employeeId)])];
};

/** Project-level check for a scoped project permission: ALL any project, TEAM only projects you lead. */
export const assertProjectInScope = async (user: AuthUser, key: PermissionKey, projectId: string) => {
  const scope = scopeOf(user, key);
  if (scope === PermissionScope.ALL) return;
  if (scope === PermissionScope.TEAM && (await pmLeadsProject(user.employeeId, projectId))) return;
  throw AppError.forbidden('You can only do this on projects you lead');
};

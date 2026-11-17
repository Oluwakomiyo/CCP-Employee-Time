import { NextFunction, Request, Response } from 'express';
import { PermissionScope } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { TokenPayload } from '../utils/token';
import { Grant, Grants, PermissionKey } from './permissions';

/** The signed-in user as the API sees it: identity plus the role's permissions (loaded per request). */
export interface AuthUser extends TokenPayload {
  roleId: string;
  grants: Grants;
}

const RANK: Record<PermissionScope, number> = { OWN: 1, TEAM: 2, ALL: 3 };

/** Builds the grant map from RolePermission rows. */
export const toGrants = (rows: { permission: string; scope: PermissionScope | null }[]): Grants =>
  Object.fromEntries(rows.map((r) => [r.permission, r.scope ?? true])) as Grants;

/** True when the user has the permission (at least `atLeast` for scoped keys). */
export const can = (user: Pick<AuthUser, 'grants'>, key: PermissionKey, atLeast?: PermissionScope) => {
  const g: Grant | undefined = user.grants[key];
  if (!g) return false;
  if (!atLeast || g === true) return true;
  return RANK[g] >= RANK[atLeast];
};

/** The scope held for a scoped key, or null when not granted. */
export const scopeOf = (user: Pick<AuthUser, 'grants'>, key: PermissionKey): PermissionScope | null => {
  const g = user.grants[key];
  return !g ? null : g === true ? PermissionScope.ALL : g;
};

/** Route guard: 403 unless the user holds any of the keys (deny by default, same envelope as before). */
export const requirePermission =
  (...keys: PermissionKey[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!keys.some((k) => can(req.user!, k))) {
      return next(AppError.forbidden('You do not have permission to access this resource.'));
    }
    next();
  };

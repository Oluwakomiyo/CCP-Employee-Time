import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { verifyAccessToken, TokenPayload } from '../utils/token';
import { AppError } from '../errors/AppError';
import { prisma } from '../config/prisma';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export const ACCESS_COOKIE = 'ccp_at';
export const REFRESH_COOKIE = 'ccp_rt';

/** Routes a user may still call while a password change is pending. */
const PASSWORD_CHANGE_ALLOWED = ['/api/v1/auth/me', '/api/v1/auth/change-password', '/api/v1/auth/logout'];

const readToken = (req: Request): string | undefined => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[ACCESS_COOKIE];
};

/**
 * Verifies the access token (Bearer header or httpOnly cookie), then re-checks the user
 * in the database so deactivation and role changes take effect immediately.
 */
export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  const token = readToken(req);
  if (!token) return next(AppError.unauthorized('Authentication required'));

  let payload: TokenPayload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(AppError.unauthorized('Invalid or expired authentication token'));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, isActive: true, mustChangePassword: true, employee: { select: { id: true } } },
    });
    if (!user || !user.isActive || !user.employee) {
      return next(AppError.unauthorized('Account is not active'));
    }

    const path = req.originalUrl.split('?')[0];
    if (user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.includes(path)) {
      return next(new AppError('You must change your password before continuing', 403, undefined, 'PASSWORD_CHANGE_REQUIRED'));
    }

    // Role and employee come from the database, not the token.
    req.user = { userId: user.id, role: user.role, employeeId: user.employee.id };
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Deny-by-default role check: 403 unless the user's role is in allowedRoles.
 */
export const authorize = (...allowedRoles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!allowedRoles.includes(req.user.role)) {
      return next(AppError.forbidden('You do not have permission to access this resource.'));
    }
    next();
  };
};

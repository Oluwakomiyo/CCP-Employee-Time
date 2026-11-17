import { toGrants } from '../../auth/can';
import bcrypt from 'bcryptjs';
import { AuditAction } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../../utils/token';
import { LoginInput } from './auth.schema';

export class AuthService {
  async login(input: LoginInput, ipAddress?: string, userAgent?: string) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: true,
            position: true,
            status: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      throw AppError.unauthorized('Invalid email or password');
    }

    if (!user.employee) {
      throw AppError.badRequest('User account is missing an associated Employee record');
    }

    const payload = {
      userId: user.id,
      role: user.role,
      employeeId: user.employee.id,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    const refreshTokenHash = hashToken(refreshToken);

    // Save hashed refresh token and log audit entry in a single transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash },
      }),
      prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: AuditAction.LOGIN,
          entityName: 'User',
          entityId: user.id,
          ipAddress,
          userAgent,
        },
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        employee: user.employee,
      },
    };
  }

  async refreshTokens(refreshToken?: string) {
    if (!refreshToken) throw AppError.unauthorized('Refresh token is required');
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { employee: true },
    });

    if (!user || !user.isActive || !user.employee) {
      throw AppError.unauthorized('User no longer active');
    }

    // Verify refresh token hash matches what is persisted in DB
    const hashed = hashToken(refreshToken);
    if (user.refreshTokenHash !== hashed) {
      // Possible token reuse attack - invalidate stored token
      await prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null },
      });
      throw AppError.forbidden('Refresh token revoked or reused');
    }

    const newPayload = {
      userId: user.id,
      role: user.role,
      employeeId: user.employee.id,
    };

    const newAccessToken = generateAccessToken(newPayload);
    const newRefreshToken = generateRefreshToken(newPayload);
    const newHash = hashToken(newRefreshToken);

    // Conditional update: a concurrent refresh with the same token loses the race.
    const rotated = await prisma.user.updateMany({
      where: { id: user.id, refreshTokenHash: hashed },
      data: { refreshTokenHash: newHash },
    });
    if (rotated.count !== 1) throw AppError.unauthorized('Refresh token revoked or reused');

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(userId: string, ipAddress?: string, userAgent?: string) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { refreshTokenHash: null },
      }),
      prisma.auditLog.create({
        data: {
          actorId: userId,
          action: AuditAction.LOGOUT,
          entityName: 'User',
          entityId: userId,
          ipAddress,
          userAgent,
        },
      }),
    ]);
  }

  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        appRole: { select: { id: true, key: true, name: true, permissions: { select: { permission: true, scope: true } } } },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: true,
            position: true,
            status: true,
            hireDate: true,
          },
        },
      },
    });

    if (!user) {
      throw AppError.notFound('User not found');
    }

    // The web builds its menu and buttons from these; the API still checks every request.
    const { appRole, ...rest } = user;
    return { ...rest, roleInfo: { id: appRole.id, key: appRole.key, name: appRole.name }, permissions: toGrants(appRole.permissions) };
  }

  async changePassword(userId: string, currentPass: string, newPass: string, ipAddress?: string, userAgent?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User not found');

    const isMatch = await bcrypt.compare(currentPass, user.passwordHash);
    if (!isMatch) throw AppError.badRequest('Current password is incorrect');
    if (await bcrypt.compare(newPass, user.passwordHash)) {
      throw AppError.badRequest('New password must be different from the current password');
    }

    const newHash = await bcrypt.hash(newPass, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash, mustChangePassword: false },
      }),
      prisma.auditLog.create({
        data: {
          actorId: userId,
          action: AuditAction.UPDATE,
          entityName: 'UserCredentials',
          entityId: userId,
          ipAddress,
          userAgent,
          afterState: { event: 'PASSWORD_CHANGED' },
        },
      }),
    ]);

    return { message: 'Password successfully updated' };
  }
}

export const authService = new AuthService();
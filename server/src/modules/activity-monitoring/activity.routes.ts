import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { AuditAction } from '@prisma/client';
import { activityController } from './activity.controller';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../auth/can';

const router = Router();

// 1. Desktop Device Agent Heartbeat (Uses X-Device-Key header, not user JWT)
router.post('/agent-heartbeat', activityController.recordAgentHeartbeat);

// 2. All subsequent routes require user authentication
router.use(authenticate);

// Browser session heartbeat (Section 92 & 112)
router.post('/browser-heartbeat', activityController.recordBrowserHeartbeat);

// The desktop app enrolls the computer it runs on for whoever is signed in (anyone who tracks time).
router.post('/devices/enroll', requirePermission('time.track'), activityController.enrollDevice);

// Manual registration from Company settings (devices carry credentials)
router.post(
  '/devices',
  requirePermission('settings.devices'),
  activityController.registerDevice
);

// Device list and revoke (CEO only). The key hash never leaves the server.
router.get('/devices', requirePermission('settings.devices'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const devices = await prisma.employeeDevice.findMany({
      orderBy: [{ isActive: 'desc' }, { lastSeenAt: 'desc' }],
      select: {
        id: true,
        deviceName: true,
        deviceIdentifier: true,
        platform: true,
        isActive: true,
        enrolledBy: true,
        lastSeenAt: true,
        createdAt: true,
        employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      },
    });
    res.json({ success: true, data: devices });
  } catch (e) {
    next(e);
  }
});

router.post('/devices/:id/revoke', requirePermission('settings.devices'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const device = await prisma.$transaction(async (tx) => {
      const res = await tx.employeeDevice.updateMany({ where: { id, isActive: true }, data: { isActive: false } });
      const found = await tx.employeeDevice.findUnique({ where: { id }, select: { id: true, deviceIdentifier: true, isActive: true } });
      if (!found) throw AppError.notFound('Device not found');
      if (res.count === 1) {
        await tx.auditLog.create({
          data: {
            actorId: req.user!.userId,
            action: AuditAction.UPDATE,
            entityName: 'EmployeeDevice',
            entityId: id,
            afterState: { event: 'DEVICE_REVOKED', deviceIdentifier: found.deviceIdentifier },
          },
        });
      }
      return found;
    });
    res.json({ success: true, data: device });
  } catch (e) {
    next(e);
  }
});

// Turn a revoked device back on. Its old key stays dead: the desktop app enrolls again and gets a new one.
router.post('/devices/:id/reinstate', requirePermission('settings.devices'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const device = await prisma.$transaction(async (tx) => {
      const found = await tx.employeeDevice.findUnique({ where: { id }, select: { id: true, deviceIdentifier: true } });
      if (!found) throw AppError.notFound('Device not found');
      const updated = await tx.employeeDevice.update({
        where: { id },
        // A fresh random hash: nothing can sign in with the pre-revoke key.
        data: { isActive: true, apiKeyHash: crypto.randomBytes(32).toString('hex') },
        select: { id: true, deviceIdentifier: true, isActive: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user!.userId,
          action: AuditAction.UPDATE,
          entityName: 'EmployeeDevice',
          entityId: id,
          afterState: { event: 'DEVICE_REINSTATED', deviceIdentifier: found.deviceIdentifier },
        },
      });
      return updated;
    });
    res.json({ success: true, data: device });
  } catch (e) {
    next(e);
  }
});

// Workday Evidence Summary (Section 102 & 112)
router.get(
  '/workdays/:id/evidence',
  activityController.getWorkEvidence
);

export const activityRouter = router;
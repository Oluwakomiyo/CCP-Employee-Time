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

// Device Registration (CEO_ADMIN only: devices carry credentials)
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

// Workday Evidence Summary (Section 102 & 112)
router.get(
  '/workdays/:id/evidence',
  activityController.getWorkEvidence
);

export const activityRouter = router;
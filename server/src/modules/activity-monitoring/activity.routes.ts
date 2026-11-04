import { Router } from 'express';
import { Role } from '@prisma/client';
import { activityController } from './activity.controller';
import { authenticate, authorize } from '../../middleware/auth.middleware';

const router = Router();

// 1. Desktop Device Agent Heartbeat (Uses X-Device-Key header, not user JWT)
router.post('/agent-heartbeat', activityController.recordAgentHeartbeat);

// 2. All subsequent routes require user authentication
router.use(authenticate);

// Browser session heartbeat (Section 92 & 112)
router.post('/browser-heartbeat', activityController.recordBrowserHeartbeat);

// Device Registration (Management only: CEO_ADMIN & PROJECT_MANAGER)
router.post(
  '/devices',
  authorize(Role.CEO_ADMIN, Role.PROJECT_MANAGER),
  activityController.registerDevice
);

// Workday Evidence Summary (Section 102 & 112)
router.get(
  '/workdays/:id/evidence',
  activityController.getWorkEvidence
);

export const activityRouter = router;
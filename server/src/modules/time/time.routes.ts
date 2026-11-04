import { Router } from 'express';
import { Role } from '@prisma/client';
import { timeController } from './time.controller';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { clockInSchema, startBreakSchema, logActivitySchema } from './time.schema';

const router = Router();

router.use(authenticate);

// 1. Live status & Timesheet History
router.get('/status', timeController.getStatus);
router.get('/history', timeController.getHistory);

// 2. Segment Clock-in & Clock-out
router.post('/clock-in', validate(clockInSchema), timeController.clockIn);
router.post('/clock-out', timeController.clockOut);

// 3. Break Management
router.post('/breaks/start', validate(startBreakSchema), timeController.startBreak);
router.post('/breaks/end', timeController.endBreak);

// 4. Activity Logging
router.post('/activities', validate(logActivitySchema), timeController.logActivity);

// -----------------------------------------------------------------------------
// 5. Missing Clock-Out Handling
// -----------------------------------------------------------------------------

// List all workdays with missing clock-outs
router.get('/flagged', timeController.getFlaggedDays);

// Manually trigger stale session auto-closure (CEO_ADMIN and PROJECT_MANAGER)
router.post(
  '/auto-close-stale',
  authorize(Role.CEO_ADMIN, Role.PROJECT_MANAGER),
  timeController.triggerAutoClose
);

export const timeRouter = router;
import { Router } from 'express';
import { Role } from '@prisma/client';
import { timeController } from './time.controller';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  startWorkSchema,
  changeProjectSchema,
  changeLocationSchema,
  changeActivitySchema,
  startBreakSchema,
} from './time.schema';

const router = Router();

router.use(authenticate);

// Status & history
router.get('/today', timeController.getToday);
router.get('/history', timeController.getHistory);

// Time engine (spec §38). Every action returns the employee's fresh status.
router.post('/start', validate(startWorkSchema), timeController.startWork);
router.post('/project', validate(changeProjectSchema), timeController.changeProject);
router.post('/location', validate(changeLocationSchema), timeController.changeLocation);
router.post('/activity', validate(changeActivitySchema), timeController.changeActivity);
router.post('/breaks/start', validate(startBreakSchema), timeController.startBreak);
router.post('/breaks/end', timeController.endBreak);
router.post('/end', timeController.endWork);

// Missing clock-outs
router.get('/flagged', timeController.getFlaggedDays);
router.post('/auto-close-stale', authorize(Role.CEO_ADMIN, Role.PROJECT_MANAGER), timeController.triggerAutoClose);

export const timeRouter = router;

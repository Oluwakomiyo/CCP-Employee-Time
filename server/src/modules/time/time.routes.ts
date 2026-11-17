import { Router } from 'express';
import { timeController } from './time.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../auth/can';
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
router.get('/history', requirePermission('timesheets.view'), timeController.getHistory);

// Time engine (spec §38). Every action returns the employee's fresh status.
router.post('/start', requirePermission('time.track'), validate(startWorkSchema), timeController.startWork);
router.post('/project', requirePermission('time.track'), validate(changeProjectSchema), timeController.changeProject);
router.post('/location', requirePermission('time.track'), validate(changeLocationSchema), timeController.changeLocation);
router.post('/activity', requirePermission('time.track'), validate(changeActivitySchema), timeController.changeActivity);
router.post('/breaks/start', requirePermission('time.track'), validate(startBreakSchema), timeController.startBreak);
router.post('/breaks/end', requirePermission('time.track'), timeController.endBreak);
router.post('/end', requirePermission('time.track'), timeController.endWork);

// Missing clock-outs
router.get('/flagged', requirePermission('timesheets.view'), timeController.getFlaggedDays);
router.post('/auto-close-stale', requirePermission('corrections.review'), timeController.triggerAutoClose);

export const timeRouter = router;

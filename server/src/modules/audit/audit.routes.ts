import { Router } from 'express';
import { auditController } from './audit.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../auth/can';

const router = Router();

router.use(authenticate);

// Append-only audit logs (CEO_ADMIN and PROJECT_MANAGER only)
router.get(
  '/logs',
  requirePermission('audit.view'),
  auditController.getLogs
);

export const auditRouter = router;
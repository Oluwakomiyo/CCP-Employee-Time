import { Router } from 'express';
import { Role } from '@prisma/client';
import { auditController } from './audit.controller';
import { authenticate, authorize } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// Append-only audit logs (CEO_ADMIN and PROJECT_MANAGER only)
router.get(
  '/logs',
  authorize(Role.CEO_ADMIN, Role.PROJECT_MANAGER),
  auditController.getLogs
);

export const auditRouter = router;
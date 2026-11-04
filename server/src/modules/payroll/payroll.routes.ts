import { Router } from 'express';
import { Role } from '@prisma/client';
import { payrollController } from './payroll.controller';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { generatePayrollSchema } from './payroll.schema';

const router = Router();

router.use(authenticate);

// 1. Employee self-service (Access own pay slips only)
router.get('/my-slips', payrollController.getMyPaySlips);

// 2. Strict CEO_ADMIN ONLY endpoints (PM and Employee return 403)
router.post(
  '/generate',
  authorize(Role.CEO_ADMIN),
  validate(generatePayrollSchema),
  payrollController.generatePayroll
);

router.get(
  '/',
  authorize(Role.CEO_ADMIN),
  payrollController.listPayroll
);

export const payrollRouter = router;
import { Router } from 'express';
import { Role } from '@prisma/client';
import { payrollController } from './payroll.controller';
import { authenticate, authorize } from '../../middleware/auth.middleware';

const router = Router();

// Payroll is CEO-only (spec §4, §29); PMs and employees get 403. Inputs are parsed in the controller.
router.use(authenticate, authorize(Role.CEO_ADMIN));

router.get('/', payrollController.listPayroll);
router.post('/generate', payrollController.generatePayroll);
router.post('/finalize', payrollController.finalizePeriod);
router.get('/export', payrollController.exportCsv);

export const payrollRouter = router;

import { Router } from 'express';
import { payrollController } from './payroll.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../auth/can';

const router = Router();

// Payroll needs payroll.view or payroll.manage (CEO preset only, spec §4, §29). Inputs are parsed in the controller.
// Deny the whole router by default (even unknown paths answer 403, spec §61); writes need payroll.manage.
router.use(authenticate, requirePermission('payroll.view', 'payroll.manage'));

router.get('/', requirePermission('payroll.view'), payrollController.listPayroll);
router.post('/generate', requirePermission('payroll.manage'), payrollController.generatePayroll);
router.post('/finalize', requirePermission('payroll.manage'), payrollController.finalizePeriod);
router.get('/export', requirePermission('payroll.manage'), payrollController.exportCsv);

export const payrollRouter = router;

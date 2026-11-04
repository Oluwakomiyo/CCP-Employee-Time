import { Router } from 'express';
import { Role } from '@prisma/client';
import { employeeController } from './employee.controller';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  updateCompensationSchema,
} from './employee.schema';

const router = Router();

// All employee routes require authentication
router.use(authenticate);

// 1. Directory Listing (Accessible by CEO_ADMIN and PROJECT_MANAGER)
router.get(
  '/',
  authorize(Role.CEO_ADMIN, Role.PROJECT_MANAGER),
  employeeController.listEmployees
);

// 2. View Individual Profile (Self, PM, or CEO_ADMIN)
router.get(
  '/:id',
  authorize(Role.CEO_ADMIN, Role.PROJECT_MANAGER, Role.EMPLOYEE),
  employeeController.getEmployeeById
);

// 3. Create Employee (CEO_ADMIN only)
router.post(
  '/',
  authorize(Role.CEO_ADMIN),
  validate(createEmployeeSchema),
  employeeController.createEmployee
);

// DELETE Employee (Strictly CEO_ADMIN only)
router.delete(
  '/:id',
  authorize(Role.CEO_ADMIN), // <--- Blocks PM & Employee with 403 Forbidden
  employeeController.deleteEmployee
);

// 4. Update Employee Info (CEO_ADMIN only)
router.patch(
  '/:id',
  authorize(Role.CEO_ADMIN),
  validate(updateEmployeeSchema),
  employeeController.updateEmployee
);

// Allow CEO to update/correct employee password
router.patch(
  '/:id/password',
  authorize(Role.CEO_ADMIN),
  employeeController.updateEmployeePassword
);

// -----------------------------------------------------------------------------
// STRICT COMPENSATION ACCESS: STRICTLY CEO_ADMIN ONLY (Deny PM & Employee)
// -----------------------------------------------------------------------------

router.get(
  '/:id/compensation',
  authorize(Role.CEO_ADMIN),
  employeeController.getCompensation
);

router.put(
  '/:id/compensation',
  authorize(Role.CEO_ADMIN),
  validate(updateCompensationSchema),
  employeeController.updateCompensation
);

export const employeeRouter = router;
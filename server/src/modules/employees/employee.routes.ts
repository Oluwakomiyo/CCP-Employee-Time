import { Router } from 'express';
import { Role } from '@prisma/client';
import { employeeController } from './employee.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../auth/can';
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
  requirePermission('employees.view'),
  employeeController.listEmployees
);

// 2. View Individual Profile (Self, PM, or CEO_ADMIN)
router.get(
  '/:id',
  // Anyone signed in; the controller allows self, or employees.view in scope.
  employeeController.getEmployeeById
);

// 3. Create Employee (CEO_ADMIN only)
router.post(
  '/',
  requirePermission('employees.manage'),
  validate(createEmployeeSchema),
  employeeController.createEmployee
);

// DELETE Employee (Strictly CEO_ADMIN only)
router.delete(
  '/:id',
  requirePermission('employees.manage'),
  employeeController.deleteEmployee
);

// 4. Update Employee Info (CEO_ADMIN only)
router.patch(
  '/:id',
  requirePermission('employees.manage'),
  validate(updateEmployeeSchema),
  employeeController.updateEmployee
);

// Allow CEO to update/correct employee password
router.patch(
  '/:id/password',
  requirePermission('employees.manage'),
  employeeController.updateEmployeePassword
);

// -----------------------------------------------------------------------------
// STRICT COMPENSATION ACCESS: STRICTLY CEO_ADMIN ONLY (Deny PM & Employee)
// -----------------------------------------------------------------------------

router.get(
  '/:id/compensation',
  requirePermission('compensation.view'),
  employeeController.getCompensation
);

router.put(
  '/:id/compensation',
  requirePermission('compensation.manage'),
  validate(updateCompensationSchema),
  employeeController.updateCompensation
);

export const employeeRouter = router;
import { z } from 'zod';
import { EmploymentStatus, Role } from '@prisma/client';

export const createEmployeeSchema = z.object({
  email: z.string().email('Valid email is required').trim().toLowerCase(),
  password: z.string().min(8, 'Temporary password must be at least 8 characters'),
  role: z.nativeEnum(Role).default(Role.EMPLOYEE),
  employeeCode: z.string().min(3, 'Employee code must be at least 3 characters').toUpperCase().trim(),
  firstName: z.string().min(1, 'First name is required').trim(),
  lastName: z.string().min(1, 'Last name is required').trim(),
  department: z.string().min(1, 'Department is required').trim(),
  position: z.string().min(1, 'Position is required').trim(),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'hireDate must be in YYYY-MM-DD format'),
  // Initial compensation (required when creating via CEO_ADMIN)
  compensation: z.object({
    baseHourlyRate: z.number().positive('Base hourly rate must be positive'),
    overtimeHourlyRate: z.number().positive('Overtime rate must be positive'),
    currency: z.string().length(3, 'Currency must be 3-letter ISO code (e.g. USD)').default('USD'),
  }),
});

export const updateEmployeeSchema = z.object({
  firstName: z.string().min(1).trim().optional(),
  lastName: z.string().min(1).trim().optional(),
  email: z.string().email('Valid email is required').trim().toLowerCase().optional(),
  employeeCode: z.string().min(3).trim().toUpperCase().optional(),
  department: z.string().min(1).trim().optional(),
  position: z.string().min(1).trim().optional(),
  status: z.nativeEnum(EmploymentStatus).optional(),
});

export const updateCompensationSchema = z.object({
  baseHourlyRate: z.number().positive('Base hourly rate must be positive'),
  overtimeHourlyRate: z.number().positive('Overtime rate must be positive'),
  currency: z.string().length(3).default('USD'),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveDate must be in YYYY-MM-DD format'),
});

export const queryEmployeesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  department: z.string().optional(),
  status: z.nativeEnum(EmploymentStatus).optional(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type UpdateCompensationInput = z.infer<typeof updateCompensationSchema>;
export type QueryEmployeesInput = z.infer<typeof queryEmployeesSchema>;
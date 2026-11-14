import { z } from 'zod';
import { ProjectStatus } from '@prisma/client';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be in YYYY-MM-DD format');
const details = {
  description: z.string().trim().max(2000).optional(),
  clientName: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
  estimatedHours: z.number().min(0).max(1_000_000).optional(),
};
const endAfterStart = (v: { startDate?: string; endDate?: string | null }) =>
  !v.startDate || !v.endDate || v.endDate >= v.startDate;

export const createProjectSchema = z.object({
  code: z
    .string()
    .min(2, 'Project code must be at least 2 characters')
    .max(20, 'Project code cannot exceed 20 characters')
    .toUpperCase()
    .trim(),
  name: z.string().min(2, 'Project name is required').max(200).trim(),
  ...details,
  status: z.nativeEnum(ProjectStatus).default(ProjectStatus.ACTIVE),
  startDate: date,
  endDate: date.optional(),
}).refine(endAfterStart, { message: 'End date must be on or after the start date', path: ['endDate'] });

export const updateProjectSchema = z.object({
  name: z.string().min(2).max(200).trim().optional(),
  ...details,
  estimatedHours: details.estimatedHours.nullable(),
  status: z.nativeEnum(ProjectStatus).optional(),
  // shortcut: legacy client toggle; true -> ACTIVE, false -> COMPLETED. Remove with client/.
  isActive: z.boolean().optional(),
  startDate: date.optional(),
  endDate: date.nullable().optional(),
}).refine(endAfterStart, { message: 'End date must be on or after the start date', path: ['endDate'] });

export const assignMemberSchema = z.object({
  employeeId: z.string().uuid('Valid employee UUID required'),
  isProjectLead: z.boolean().default(false),
});

export const queryProjectsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AssignMemberInput = z.infer<typeof assignMemberSchema>;
export type QueryProjectsInput = z.infer<typeof queryProjectsSchema>;
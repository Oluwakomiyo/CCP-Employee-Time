import { z } from 'zod';

export const createProjectSchema = z.object({
  code: z
    .string()
    .min(2, 'Project code must be at least 2 characters')
    .max(20, 'Project code cannot exceed 20 characters')
    .toUpperCase()
    .trim(),
  name: z.string().min(2, 'Project name is required').trim(),
  description: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format').optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(2).trim().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const assignMemberSchema = z.object({
  employeeId: z.string().uuid('Valid employee UUID required'),
  isProjectLead: z.boolean().default(false),
});

export const queryProjectsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AssignMemberInput = z.infer<typeof assignMemberSchema>;
export type QueryProjectsInput = z.infer<typeof queryProjectsSchema>;
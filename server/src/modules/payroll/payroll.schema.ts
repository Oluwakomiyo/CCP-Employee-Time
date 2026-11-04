import { z } from 'zod';

export const generatePayrollSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'periodStart must be YYYY-MM-DD'),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'periodEnd must be YYYY-MM-DD'),
  employeeId: z.string().uuid('Optional employee UUID').optional(),
}).refine(
  (data) => new Date(data.periodEnd) >= new Date(data.periodStart),
  {
    message: 'periodEnd cannot be earlier than periodStart',
    path: ['periodEnd'],
  }
);

export const queryPayrollSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  employeeId: z.string().uuid().optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type GeneratePayrollInput = z.infer<typeof generatePayrollSchema>;
export type QueryPayrollInput = z.infer<typeof queryPayrollSchema>;
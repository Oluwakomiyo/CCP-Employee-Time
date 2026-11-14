import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD');

export const rangeQuerySchema = z
  .object({ from: date.optional(), to: date.optional() })
  .refine((r) => !r.from || !r.to || r.from <= r.to, { message: '`from` must be on or before `to`', path: ['to'] });

export const idParamSchema = z.object({ id: z.string().uuid('Invalid id') });

/** One company date for the workday lookup behind the evidence screen. */
export const workdayQuerySchema = z.object({ date });

export const estimateQuerySchema = z.object({
  projectId: z.string().uuid(),
  // Comma-separated list: ?employeeIds=a,b,c
  employeeIds: z
    .string()
    .transform((v) => [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean))])
    .pipe(z.array(z.string().uuid()).min(1, 'Pick at least one employee').max(50)),
});

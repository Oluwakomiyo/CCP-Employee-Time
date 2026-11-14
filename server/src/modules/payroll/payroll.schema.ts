import { z } from 'zod';
import { PayrollStatus } from '@prisma/client';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD');

export const periodSchema = z
  .object({ periodStart: date, periodEnd: date })
  .refine((d) => d.periodEnd >= d.periodStart, { message: 'periodEnd cannot be earlier than periodStart', path: ['periodEnd'] })
  .refine((d) => (Date.parse(d.periodEnd) - Date.parse(d.periodStart)) / 86_400_000 <= 92, {
    message: 'A payroll period can be at most 3 months',
    path: ['periodEnd'],
  });

export const generatePayrollSchema = z
  .object({ periodStart: date, periodEnd: date, employeeId: z.string().uuid().optional() })
  .superRefine((d, ctx) => {
    const r = periodSchema.safeParse(d);
    if (!r.success) r.error.issues.forEach((i) => ctx.addIssue(i));
  });

export const queryPayrollSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  employeeId: z.string().uuid().optional(),
  periodStart: date.optional(),
  periodEnd: date.optional(),
  status: z.nativeEnum(PayrollStatus).optional(),
});

export type GeneratePayrollInput = z.infer<typeof generatePayrollSchema>;
export type PeriodInput = z.infer<typeof periodSchema>;
export type QueryPayrollInput = z.infer<typeof queryPayrollSchema>;

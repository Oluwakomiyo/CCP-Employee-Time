import { z } from 'zod';
import { BreakType } from '@prisma/client';

export const clockInSchema = z.object({
  projectId: z.string().uuid('Valid project UUID is required'),
});

export const startBreakSchema = z.object({
  breakType: z.nativeEnum(BreakType).default(BreakType.REST),
  isPaid: z.boolean().default(false),
});

export const logActivitySchema = z.object({
  title: z.string().min(2, 'Activity title must be at least 2 characters').trim(),
  notes: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
});

export const timeHistoryQuerySchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format')
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format')
    .optional(),
  employeeId: z.string().uuid().optional(),
  all: z.enum(['true', 'false']).optional(),
});

export type ClockInInput = z.infer<typeof clockInSchema>;
export type StartBreakInput = z.infer<typeof startBreakSchema>;
export type LogActivityInput = z.infer<typeof logActivitySchema>;
export type TimeHistoryQueryInput = z.infer<typeof timeHistoryQuerySchema>;
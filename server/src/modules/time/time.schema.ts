import { z } from 'zod';
import { ActivityType, BreakType, LocationType } from '@prisma/client';

const description = z.string().trim().max(500).optional();

/**
 * Accepts the spec's `locationType` and the legacy client's `location`; normalised to `location`.
 */
const withLocation = <T extends z.ZodRawShape>(shape: T, required: boolean) =>
  z
    .object({
      ...shape,
      location: z.nativeEnum(LocationType).optional(),
      locationType: z.nativeEnum(LocationType).optional(),
    })
    .transform(({ locationType, location, ...rest }) => ({ ...rest, location: locationType ?? location }))
    .refine((v) => !required || v.location !== undefined, { message: 'locationType is required', path: ['locationType'] });

export const startWorkSchema = withLocation(
  {
    projectId: z.string().uuid('Valid project id is required'),
    activityType: z.nativeEnum(ActivityType).default(ActivityType.OTHER),
    description,
  },
  false
);

export const changeProjectSchema = withLocation(
  {
    projectId: z.string().uuid('Valid project id is required'),
    activityType: z.nativeEnum(ActivityType).optional(),
    description,
  },
  false
);

export const changeLocationSchema = withLocation({}, true);

export const changeActivitySchema = z.object({
  activityType: z.nativeEnum(ActivityType).default(ActivityType.OTHER),
  description,
  // Legacy client sends a free-text title; it becomes the description.
  title: z.string().trim().max(200).optional(),
});

export const startBreakSchema = z.object({
  breakType: z.nativeEnum(BreakType).default(BreakType.REST),
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

export const autoCloseQuerySchema = z.object({
  cutoffHours: z.coerce.number().int().min(1).max(72).default(16),
});

export type StartWorkInput = z.infer<typeof startWorkSchema>;
export type ChangeProjectInput = z.infer<typeof changeProjectSchema>;
export type ChangeLocationInput = z.infer<typeof changeLocationSchema>;
export type ChangeActivityInput = z.infer<typeof changeActivitySchema>;
export type StartBreakInput = z.infer<typeof startBreakSchema>;
export type TimeHistoryQueryInput = z.infer<typeof timeHistoryQuerySchema>;

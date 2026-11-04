import { z } from 'zod';
import { CorrectionStatus } from '@prisma/client';

export const createCorrectionSchema = z.object({
  workDayId: z.string().uuid('Valid workDayId required'),
  reason: z
    .string()
    .min(5, 'A clear reason for the time correction is required')
    .max(500)
    .trim(),
  requestedChanges: z.object({
    segmentId: z.string().uuid().optional(), // If amending an existing segment
    projectId: z.string().uuid().optional(), // If creating a new missed segment
    proposedClockIn: z.string().datetime('Valid ISO 8601 proposedClockIn is required'),
    proposedClockOut: z.string().datetime('Valid ISO 8601 proposedClockOut is required'),
  }).refine(
    (data) => new Date(data.proposedClockOut) > new Date(data.proposedClockIn),
    {
      message: 'proposedClockOut must be after proposedClockIn',
      path: ['proposedClockOut'],
    }
  ),
});

export const reviewCorrectionSchema = z.object({
  status: z.enum([CorrectionStatus.APPROVED, CorrectionStatus.REJECTED]),
  reviewNotes: z.string().max(500).trim().optional(),
});

export const queryCorrectionsSchema = z.object({
  status: z.nativeEnum(CorrectionStatus).optional(),
  employeeId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const updateCorrectionSchema = z.object({
  reason: z.string().min(5).max(500).trim().optional(),
  requestedChanges: z.object({
    segmentId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    proposedClockIn: z.string().datetime(),
    proposedClockOut: z.string().datetime(),
  }).refine((data) => new Date(data.proposedClockOut) > new Date(data.proposedClockIn), {
    message: 'proposedClockOut must be after proposedClockIn',
    path: ['proposedClockOut'],
  }).optional(),
});

export type UpdateCorrectionInput = z.infer<typeof updateCorrectionSchema>;
export type CreateCorrectionInput = z.infer<typeof createCorrectionSchema>;
export type ReviewCorrectionInput = z.infer<typeof reviewCorrectionSchema>;
export type QueryCorrectionsInput = z.infer<typeof queryCorrectionsSchema>;
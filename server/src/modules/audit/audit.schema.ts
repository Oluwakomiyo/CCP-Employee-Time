import { z } from 'zod';
import { AuditAction } from '@prisma/client';

export const queryAuditLogsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  actorId: z.string().uuid().optional(),
  action: z.nativeEnum(AuditAction).optional(),
  entityName: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type QueryAuditLogsInput = z.infer<typeof queryAuditLogsSchema>;
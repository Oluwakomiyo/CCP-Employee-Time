import { Prisma, Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { QueryAuditLogsInput } from './audit.schema';

export class AuditService {
  /**
   * Retrieves immutable audit records:
   * - CEO_ADMIN: Views all logs system-wide.
   * - PROJECT_MANAGER: Views logs where they were the actor or related to projects.
   */
  async listLogs(query: QueryAuditLogsInput, userRole: Role, userId: string) {
    const { page, limit, actorId, action, entityName, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (userRole === Role.PROJECT_MANAGER) {
      where.actorId = userId;
    } else if (actorId) {
      where.actorId = actorId;
    }

    if (action) {
      where.action = action;
    }

    if (entityName) {
      where.entityName = { equals: entityName, mode: 'insensitive' };
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    const [total, items] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              role: true,
              employee: {
                select: {
                  firstName: true,
                  lastName: true,
                  employeeCode: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const auditService = new AuditService();
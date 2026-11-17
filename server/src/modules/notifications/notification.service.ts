import { NotificationType, Prisma, PermissionScope } from '@prisma/client';
import { prisma, DbClient } from '../../config/prisma';
import { AppError } from '../../errors/AppError';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  /** Deep-link payload (ids only). Never put pay or rate data here. */
  data?: Prisma.InputJsonObject;
}

/**
 * Writes notifications inside the caller's transaction, so a notification exists only if the
 * event that caused it committed. Duplicate and empty recipient lists are ignored.
 */
export const notify = async (tx: DbClient, userIds: (string | null | undefined)[], n: NotificationInput) => {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  if (!ids.length) return;
  await tx.notification.createMany({
    data: ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body, data: n.data })),
  });
};

/** Users who may review a correction for this employee (by corrections.review scope). */
export const reviewerUserIds = async (tx: DbClient, employeeId: string) => {
  const users = await tx.user.findMany({
    where: {
      isActive: true,
      // Whoever holds corrections.review: everyone-scope reviewers, and team-scope reviewers
      // who lead one of the employee's projects.
      OR: [
        { appRole: { permissions: { some: { permission: 'corrections.review', scope: PermissionScope.ALL } } } },
        {
          appRole: { permissions: { some: { permission: 'corrections.review', scope: PermissionScope.TEAM } } },
          employee: {
            id: { not: employeeId },
            projectMemberships: {
              some: {
                isProjectLead: true,
                removedAt: null,
                project: { members: { some: { employeeId, removedAt: null } } },
              },
            },
          },
        },
      ],
    },
    select: { id: true, employee: { select: { id: true } } },
  });
  // Nobody reviews their own request (a CEO's own correction goes to the other reviewers).
  return users.filter((u) => u.employee?.id !== employeeId).map((u) => u.id);
};

export const userIdOfEmployee = async (tx: DbClient, employeeId: string) =>
  (await tx.employee.findUnique({ where: { id: employeeId }, select: { userId: true } }))?.userId;

export class NotificationService {
  async list(userId: string, opts: { unreadOnly: boolean; limit: number }) {
    const [items, unread] = await prisma.$transaction([
      prisma.notification.findMany({
        where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: opts.limit,
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unread };
  }

  async markRead(userId: string, id: string) {
    // Scoped by userId: someone else's id looks like a missing one (no existence leak).
    const res = await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    if (res.count === 0 && !(await prisma.notification.count({ where: { id, userId } }))) {
      throw AppError.notFound('Notification not found');
    }
  }

  async markAllRead(userId: string) {
    const res = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: res.count };
  }
}

export const notificationService = new NotificationService();

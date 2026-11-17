import { AuthUser, can, scopeOf } from '../../auth/can';
import { Grants } from '../../auth/permissions';
import { assertCanSee, visibleEmployeeIds } from '../../utils/access';
import { SegmentStatus, DayStatus, AuditAction, Prisma, LocationType, ActivityType, ProjectStatus, PermissionScope } from '@prisma/client';
import { prisma, DbClient } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { workDateFor } from '../../utils/time';
import { pageMeta } from '../../utils/listing';
import { withEmployeeLock, recomputeDayTotals, secondsBetween } from './time.totals';
import {
  StartWorkInput,
  ChangeProjectInput,
  ChangeLocationInput,
  ChangeActivityInput,
  StartBreakInput,
  TimeHistoryQueryInput,
} from './time.schema';

/** Who is acting and from where; all timestamps are generated here, never taken from the client (spec §8). */
export interface TimeActor {
  employeeId: string;
  userId: string;
  grants: Grants;
  ip?: string;
}

const activeSegmentFor = (tx: DbClient, employeeId: string) =>
  tx.workSegment.findFirst({
    where: { workDay: { employeeId }, status: SegmentStatus.ACTIVE },
    include: {
      project: { select: { id: true, code: true, name: true } },
      breaks: { where: { endTime: null } },
      activities: { where: { endTime: null } },
    },
  });

type ActiveSegment = NonNullable<Awaited<ReturnType<typeof activeSegmentFor>>>;

const requireActive = async (tx: DbClient, employeeId: string): Promise<ActiveSegment> => {
  const segment = await activeSegmentFor(tx, employeeId);
  if (!segment) throw new AppError('You have not started work', 409, undefined, 'NO_ACTIVE_WORKDAY');
  return segment;
};

const requireNotOnBreak = (segment: ActiveSegment, action: string) => {
  if (segment.breaks.length > 0) {
    throw new AppError(`End your break before you ${action}`, 409, undefined, 'ON_BREAK');
  }
};

/** Spec §8: project must exist, be active and be assigned to the employee. */
const assertCanWorkOn = async (tx: DbClient, actor: TimeActor, projectId: string) => {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    include: { members: { where: { employeeId: actor.employeeId, removedAt: null } } },
  });
  if (!project) throw AppError.badRequest('Project does not exist');
  if (project.status !== ProjectStatus.ACTIVE) throw AppError.badRequest('Project is not active');
  // Assigned members only, unless the actor manages every project (CEO preset).
  if (!can(actor, 'projects.manage', PermissionScope.ALL) && project.members.length === 0) {
    throw AppError.forbidden('You are not assigned to this project');
  }
  return project;
};

const audit = (tx: DbClient, actor: TimeActor, action: AuditAction, entityName: string, entityId: string, afterState: Prisma.JsonObject) =>
  tx.auditLog.create({ data: { actorId: actor.userId, action, entityName, entityId, ipAddress: actor.ip, afterState } });

/** Closes the open activity and segment at `now` and returns the segment's duration. */
const closeSegment = async (tx: DbClient, segment: ActiveSegment, now: Date, actor: TimeActor) => {
  await tx.activity.updateMany({ where: { workSegmentId: segment.id, endTime: null }, data: { endTime: now } });
  const durationSeconds = secondsBetween(segment.clockIn, now);
  await tx.workSegment.update({
    where: { id: segment.id },
    data: { clockOut: now, durationSeconds, clockOutIp: actor.ip, status: SegmentStatus.COMPLETED },
  });
  return durationSeconds;
};

const openSegment = async (
  tx: DbClient,
  workDayId: string,
  actor: TimeActor,
  now: Date,
  ctx: { projectId: string; location: LocationType; activityType: ActivityType; description?: string | null }
) => {
  const segment = await tx.workSegment.create({
    data: {
      workDayId,
      projectId: ctx.projectId,
      location: ctx.location,
      status: SegmentStatus.ACTIVE,
      clockIn: now,
      clockInIp: actor.ip,
    },
  });
  await tx.activity.create({
    data: {
      workSegmentId: segment.id,
      projectId: ctx.projectId,
      activityType: ctx.activityType,
      notes: ctx.description ?? null,
      startTime: now,
    },
  });
  return segment;
};

export class TimeService {
  /** POST /time/start: creates (or reopens) today's workday, a segment and an activity atomically. */
  async startWork(actor: TimeActor, input: StartWorkInput) {
    return withEmployeeLock(actor.employeeId, async (tx) => {
      const active = await activeSegmentFor(tx, actor.employeeId);
      if (active) {
        throw new AppError('You already have an active workday.', 409, undefined, 'ACTIVE_WORKDAY_EXISTS');
      }
      await assertCanWorkOn(tx, actor, input.projectId);

      const now = new Date();
      const date = workDateFor(now);
      const existing = await tx.workDay.findUnique({ where: { employeeId_date: { employeeId: actor.employeeId, date } } });
      const workDay =
        existing ??
        (await tx.workDay.create({ data: { employeeId: actor.employeeId, date, status: DayStatus.OPEN } }));
      if (existing && existing.status === DayStatus.COMPLETED) {
        await tx.workDay.update({ where: { id: existing.id }, data: { status: DayStatus.OPEN } });
      }

      const segment = await openSegment(tx, workDay.id, actor, now, {
        projectId: input.projectId,
        location: input.location ?? LocationType.OFFICE,
        activityType: input.activityType,
        description: input.description,
      });
      await audit(tx, actor, AuditAction.CLOCK_IN, 'WorkDay', workDay.id, {
        event: 'WORKDAY_STARTED',
        segmentId: segment.id,
        projectId: input.projectId,
        at: now.toISOString(),
      });
      return this.statusIn(tx, actor.employeeId);
    });
  }

  /** POST /time/project: closes the segment/activity and opens new ones on another project (spec §10). */
  async changeProject(actor: TimeActor, input: ChangeProjectInput) {
    return withEmployeeLock(actor.employeeId, async (tx) => {
      const current = await requireActive(tx, actor.employeeId);
      requireNotOnBreak(current, 'change project');
      if (current.projectId === input.projectId && (input.location ?? current.location) === current.location) {
        throw AppError.badRequest('You are already working on this project at this location');
      }
      await assertCanWorkOn(tx, actor, input.projectId);

      const now = new Date();
      const currentActivity = current.activities[0];
      await closeSegment(tx, current, now, actor);
      const segment = await openSegment(tx, current.workDayId, actor, now, {
        projectId: input.projectId,
        location: input.location ?? current.location,
        activityType: input.activityType ?? currentActivity?.activityType ?? ActivityType.OTHER,
        description: input.description ?? (input.activityType ? null : currentActivity?.notes),
      });
      await audit(tx, actor, AuditAction.UPDATE, 'WorkSegment', segment.id, {
        event: 'PROJECT_CHANGED',
        fromProjectId: current.projectId,
        toProjectId: input.projectId,
        at: now.toISOString(),
      });
      return this.statusIn(tx, actor.employeeId);
    });
  }

  /** POST /time/location: new segment on the same project, keeping the current activity (spec §11). */
  async changeLocation(actor: TimeActor, input: ChangeLocationInput) {
    return withEmployeeLock(actor.employeeId, async (tx) => {
      const current = await requireActive(tx, actor.employeeId);
      requireNotOnBreak(current, 'change location');
      const location = input.location as LocationType;
      if (current.location === location) throw AppError.badRequest(`You are already at ${location}`);

      const now = new Date();
      const currentActivity = current.activities[0];
      await closeSegment(tx, current, now, actor);
      const segment = await openSegment(tx, current.workDayId, actor, now, {
        projectId: current.projectId,
        location,
        activityType: currentActivity?.activityType ?? ActivityType.OTHER,
        description: currentActivity?.notes,
      });
      await audit(tx, actor, AuditAction.UPDATE, 'WorkSegment', segment.id, {
        event: 'LOCATION_CHANGED',
        from: current.location,
        to: location,
        at: now.toISOString(),
      });
      return this.statusIn(tx, actor.employeeId);
    });
  }

  /** POST /time/activity: closes the current activity and opens a new one in the same segment (spec §12). */
  async changeActivity(actor: TimeActor, input: ChangeActivityInput) {
    return withEmployeeLock(actor.employeeId, async (tx) => {
      const current = await requireActive(tx, actor.employeeId);
      requireNotOnBreak(current, 'change activity');

      const now = new Date();
      await tx.activity.updateMany({ where: { workSegmentId: current.id, endTime: null }, data: { endTime: now } });
      const activity = await tx.activity.create({
        data: {
          workSegmentId: current.id,
          projectId: current.projectId,
          activityType: input.activityType,
          notes: input.description ?? input.title ?? null,
          startTime: now,
        },
      });
      await audit(tx, actor, AuditAction.UPDATE, 'Activity', activity.id, {
        event: 'ACTIVITY_CHANGED',
        activityType: input.activityType,
        at: now.toISOString(),
      });
      return this.statusIn(tx, actor.employeeId);
    });
  }

  /** POST /time/breaks/start. Breaks are unpaid in V1 (client cannot mark them paid). */
  async startBreak(actor: TimeActor, input: StartBreakInput) {
    return withEmployeeLock(actor.employeeId, async (tx) => {
      const current = await requireActive(tx, actor.employeeId);
      if (current.breaks.length > 0) {
        throw new AppError('You are already on a break', 409, undefined, 'ALREADY_ON_BREAK');
      }
      const now = new Date();
      const record = await tx.break.create({
        data: { workSegmentId: current.id, breakType: input.breakType, isPaid: false, startTime: now },
      });
      await audit(tx, actor, AuditAction.UPDATE, 'Break', record.id, {
        event: 'BREAK_STARTED',
        breakType: input.breakType,
        at: now.toISOString(),
      });
      return this.statusIn(tx, actor.employeeId);
    });
  }

  /** POST /time/breaks/end */
  async endBreak(actor: TimeActor) {
    return withEmployeeLock(actor.employeeId, async (tx) => {
      const current = await requireActive(tx, actor.employeeId);
      const open = current.breaks[0];
      if (!open) throw new AppError('You are not on a break', 409, undefined, 'NOT_ON_BREAK');

      const now = new Date();
      const durationSeconds = secondsBetween(open.startTime, now);
      await tx.break.update({ where: { id: open.id }, data: { endTime: now, durationSeconds } });
      await recomputeDayTotals(tx, current.workDayId);
      await audit(tx, actor, AuditAction.UPDATE, 'Break', open.id, {
        event: 'BREAK_ENDED',
        durationSeconds,
        at: now.toISOString(),
      });
      return this.statusIn(tx, actor.employeeId);
    });
  }

  /** POST /time/end: closes everything and completes the workday (spec §14). */
  async endWork(actor: TimeActor) {
    return withEmployeeLock(actor.employeeId, async (tx) => {
      const current = await requireActive(tx, actor.employeeId);
      requireNotOnBreak(current, 'end work');

      const now = new Date();
      await closeSegment(tx, current, now, actor);
      const totals = await recomputeDayTotals(tx, current.workDayId);
      // Only an OPEN day becomes CLOSED; flagged or under-correction days keep their status.
      await tx.workDay.updateMany({
        where: { id: current.workDayId, status: DayStatus.OPEN },
        data: { status: DayStatus.COMPLETED },
      });
      await audit(tx, actor, AuditAction.CLOCK_OUT, 'WorkDay', current.workDayId, {
        event: 'WORKDAY_ENDED',
        segmentId: current.id,
        at: now.toISOString(),
        ...totals,
      });
      return this.statusIn(tx, actor.employeeId);
    });
  }

  /** GET /time/today */
  async getToday(employeeId: string) {
    return this.statusIn(prisma, employeeId);
  }

  /**
   * Current state for the employee dashboard (spec §45). Keeps the fields the legacy
   * client reads (isClockedIn, activeSegment.*) and adds today's totals.
   */
  private async statusIn(db: DbClient, employeeId: string) {
    const now = new Date();
    const segment = await activeSegmentFor(db, employeeId);
    // The running segment's day (may be yesterday for overnight work), else today's date.
    const include = { segments: { include: { breaks: true } } } as const;
    const workDay = segment
      ? await db.workDay.findUnique({ where: { id: segment.workDayId }, include })
      : await db.workDay.findUnique({ where: { employeeId_date: { employeeId, date: workDateFor(now) } }, include });

    // Today's net working time including the running segment and any running break.
    let presence = 0;
    let breaks = 0;
    for (const s of workDay?.segments ?? []) {
      if (s.durationSeconds !== null) presence += s.durationSeconds;
      else if (s.status === SegmentStatus.ACTIVE) presence += secondsBetween(s.clockIn, now);
      for (const b of s.breaks) {
        breaks += b.durationSeconds ?? (b.endTime ? 0 : secondsBetween(b.startTime, now));
      }
    }

    const activeBreak = segment?.breaks[0] ?? null;
    const activity = segment?.activities[0] ?? null;
    const state = !segment ? 'NOT_WORKING' : activeBreak ? 'ON_BREAK' : 'WORKING';

    return {
      state,
      isClockedIn: !!segment,
      today: {
        workDayId: workDay?.id ?? null,
        status: workDay?.status ?? null,
        presenceSeconds: presence,
        breakSeconds: breaks,
        workingSeconds: Math.max(0, presence - breaks),
      },
      activeSegment: segment
        ? {
            id: segment.id,
            projectId: segment.projectId,
            projectName: segment.project.name,
            projectCode: segment.project.code,
            location: segment.location,
            clockIn: segment.clockIn,
            elapsedSeconds: secondsBetween(segment.clockIn, now),
            activity: activity
              ? { id: activity.id, activityType: activity.activityType, description: activity.notes, startTime: activity.startTime }
              : null,
            isOnBreak: !!activeBreak,
            activeBreak: activeBreak
              ? {
                  id: activeBreak.id,
                  breakType: activeBreak.breakType,
                  startTime: activeBreak.startTime,
                  breakElapsedSeconds: secondsBetween(activeBreak.startTime, now),
                }
              : null,
          }
        : null,
    };
  }

  /** GET /me/time and /time/history: own records; management may pass all=true / employeeId. */
  async getTimesheetHistory(query: TimeHistoryQueryInput, user: AuthUser, userEmployeeId: string) {
    const where: Prisma.WorkDayWhereInput = {};

    // all=true is for people whose timesheets.view reaches beyond themselves, and only within that scope.
    if (query.all === 'true' && scopeOf(user, 'timesheets.view') !== PermissionScope.OWN) {
      if (query.employeeId) {
        await assertCanSee(user, 'timesheets.view', query.employeeId);
        where.employeeId = query.employeeId;
      } else {
        const ids = await visibleEmployeeIds(user, 'timesheets.view');
        if (ids) where.employeeId = { in: ids };
      }
    } else {
      where.employeeId = userEmployeeId;
    }
    if (query.startDate || query.endDate) {
      where.date = {
        ...(query.startDate ? { gte: new Date(`${query.startDate}T00:00:00.000Z`) } : {}),
        ...(query.endDate ? { lte: new Date(`${query.endDate}T00:00:00.000Z`) } : {}),
      };
    }

    // Filter days by what was worked on them.
    if (query.projectId || query.location) {
      where.segments = {
        some: {
          ...(query.projectId ? { projectId: query.projectId } : {}),
          ...(query.location ? { location: query.location } : {}),
        },
      };
    }

    const [total, history] = await Promise.all([
      prisma.workDay.count({ where }),
      prisma.workDay.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          segments: {
            orderBy: { clockIn: 'asc' },
            include: {
              project: { select: { id: true, code: true, name: true } },
              breaks: { orderBy: { startTime: 'asc' } },
              activities: { orderBy: { startTime: 'asc' } },
            },
          },
          employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        },
      }),
    ]);
    return { history, meta: pageMeta(query.page, query.limit, total) };
  }
}

export const timeService = new TimeService();

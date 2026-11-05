import {
  SegmentStatus,
  DayStatus,
  AuditAction,
  Role,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import {
  ClockInInput,
  StartBreakInput,
  LogActivityInput,
  TimeHistoryQueryInput,
} from './time.schema';

export class TimeService {
  /**
   * Clocks in an employee to a project (From Phase 5)
   */
  async clockIn(
    employeeId: string,
    input: ClockInInput,
    userRole: Role,
    userId: string,
    ipAddress?: string
  ) {
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      include: { members: true },
    });

    if (!project || !project.isActive) {
      throw AppError.badRequest('Project does not exist or is currently inactive');
    }

    if (userRole !== Role.CEO_ADMIN) {
      const isMember = project.members.some((m) => m.employeeId === employeeId);
      if (!isMember) {
        throw AppError.forbidden('You are not assigned to log time against this project');
      }
    }

    const activeSegment = await prisma.workSegment.findFirst({
      where: {
        workDay: { employeeId },
        status: SegmentStatus.ACTIVE,
      },
      include: { project: true },
    });

    if (activeSegment) {
      throw AppError.conflict(
        `Already clocked in to project '${activeSegment.project.name}'. Clock out before starting a new segment.`
      );
    }

    const now = new Date();
    const todayDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const newSegment = await prisma.$transaction(async (tx) => {
      let workDay = await tx.workDay.findUnique({
        where: {
          employeeId_date: {
            employeeId,
            date: todayDate,
          },
        },
      });

      if (!workDay) {
        workDay = await tx.workDay.create({
          data: {
            employeeId,
            date: todayDate,
            status: DayStatus.OPEN,
          },
        });
      }

      const segment = await tx.workSegment.create({
        data: {
          workDayId: workDay.id,
          projectId: input.projectId,
          status: SegmentStatus.ACTIVE,
          clockIn: now,
          clockInIp: ipAddress,
        },
        include: {
          project: {
            select: { id: true, code: true, name: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: AuditAction.CLOCK_IN,
          entityName: 'WorkSegment',
          entityId: segment.id,
          ipAddress,
          afterState: {
            projectId: input.projectId,
            clockIn: now.toISOString(),
          },
        },
      });

      return segment;
    });

    return newSegment;
  }

  /**
   * Starts a break within the currently active segment.
   * Enforces:
   * 1. Must be currently clocked into a segment.
   * 2. Cannot start a break if another break is already active.
   */
  async startBreak(employeeId: string, input: StartBreakInput, userId: string) {
    const activeSegment = await prisma.workSegment.findFirst({
      where: {
        workDay: { employeeId },
        status: SegmentStatus.ACTIVE,
      },
      include: {
        breaks: {
          where: { endTime: null },
        },
      },
    });

    if (!activeSegment) {
      throw AppError.badRequest('You must be clocked in to start a break');
    }

    if (activeSegment.breaks.length > 0) {
      throw AppError.conflict('A break is already in progress. End your current break first.');
    }

    const now = new Date();

    const breakRecord = await prisma.$transaction(async (tx) => {
      const b = await tx.break.create({
        data: {
          workSegmentId: activeSegment.id,
          breakType: input.breakType,
          isPaid: input.isPaid,
          startTime: now,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: AuditAction.UPDATE,
          entityName: 'Break',
          entityId: b.id,
          afterState: {
            breakType: input.breakType,
            startTime: now.toISOString(),
            isPaid: input.isPaid,
          },
        },
      });

      return b;
    });

    return breakRecord;
  }

  /**
   * Ends the currently active break and calculates duration.
   * Enforces:
   * 1. An active break must exist.
   * 2. Recalculates WorkDay.totalBreakSeconds.
   */
  async endBreak(employeeId: string, userId: string) {
    const activeSegment = await prisma.workSegment.findFirst({
      where: {
        workDay: { employeeId },
        status: SegmentStatus.ACTIVE,
      },
      include: {
        breaks: {
          where: { endTime: null },
        },
      },
    });

    if (!activeSegment || activeSegment.breaks.length === 0) {
      throw AppError.badRequest('No active break found to end');
    }

    const activeBreak = activeSegment.breaks[0];
    const endTime = new Date();
    const durationSeconds = Math.max(
      0,
      Math.floor((endTime.getTime() - new Date(activeBreak.startTime).getTime()) / 1000)
    );

    const endedBreak = await prisma.$transaction(async (tx) => {
      const b = await tx.break.update({
        where: { id: activeBreak.id },
        data: {
          endTime,
          durationSeconds,
        },
      });

      // Sum all completed breaks for the entire workday
      const allDayBreaks = await tx.break.findMany({
        where: {
          workSegment: { workDayId: activeSegment.workDayId },
          endTime: { not: null },
        },
        select: { durationSeconds: true },
      });

      const totalBreakSeconds = allDayBreaks.reduce(
        (sum, item) => sum + (item.durationSeconds || 0),
        0
      );

      await tx.workDay.update({
        where: { id: activeSegment.workDayId },
        data: { totalBreakSeconds },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: AuditAction.UPDATE,
          entityName: 'Break',
          entityId: b.id,
          afterState: {
            endTime: endTime.toISOString(),
            durationSeconds,
          },
        },
      });

      return b;
    });

    return endedBreak;
  }

  /**
   * Logs a specific task/activity against the currently active segment.
   */
  async logActivity(employeeId: string, input: LogActivityInput) {
    const activeSegment = await prisma.workSegment.findFirst({
      where: {
        workDay: { employeeId },
        status: SegmentStatus.ACTIVE,
      },
    });

    if (!activeSegment) {
      throw AppError.badRequest('You must be actively clocked in to log an activity');
    }

    const startTime = input.startTime ? new Date(input.startTime) : new Date();
    const endTime = input.endTime ? new Date(input.endTime) : null;

    const activity = await prisma.activity.create({
      data: {
        workSegmentId: activeSegment.id,
        projectId: activeSegment.projectId,
        title: input.title,
        notes: input.notes,
        startTime,
        endTime,
      },
    });

    return activity;
  }

  /**
   * Clocks out of the current segment (From Phase 5)
   */
  async clockOut(employeeId: string, userId: string, ipAddress?: string) {
    const activeSegment = await prisma.workSegment.findFirst({
      where: {
        workDay: { employeeId },
        status: SegmentStatus.ACTIVE,
      },
      include: {
        breaks: {
          where: { endTime: null },
        },
      },
    });

    if (!activeSegment) {
      throw AppError.badRequest('No active clock-in session found to clock out of');
    }

    if (activeSegment.breaks.length > 0) {
      throw AppError.conflict(
        'You have an ongoing break. Please end your break before clocking out.'
      );
    }

    const clockOutTime = new Date();
    const durationSeconds = Math.max(
      0,
      Math.floor((clockOutTime.getTime() - new Date(activeSegment.clockIn).getTime()) / 1000)
    );

    const completedSegment = await prisma.$transaction(async (tx) => {
      const segment = await tx.workSegment.update({
        where: { id: activeSegment.id },
        data: {
          clockOut: clockOutTime,
          durationSeconds,
          clockOutIp: ipAddress,
          status: SegmentStatus.COMPLETED,
        },
        include: {
          project: { select: { id: true, code: true, name: true } },
        },
      });

      const allCompletedSegments = await tx.workSegment.findMany({
        where: {
          workDayId: activeSegment.workDayId,
          status: SegmentStatus.COMPLETED,
        },
        select: { durationSeconds: true },
      });

      const totalWorkSeconds = allCompletedSegments.reduce(
        (sum, s) => sum + (s.durationSeconds || 0),
        0
      );

      await tx.workDay.update({
        where: { id: activeSegment.workDayId },
        data: { totalWorkSeconds },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: AuditAction.CLOCK_OUT,
          entityName: 'WorkSegment',
          entityId: segment.id,
          ipAddress,
          afterState: {
            clockOut: clockOutTime.toISOString(),
            durationSeconds,
          },
        },
      });

      return segment;
    });

    return completedSegment;
  }

  /**
   * Live status check (From Phase 5)
   */
  async getCurrentStatus(employeeId: string) {
    const activeSegment = await prisma.workSegment.findFirst({
      where: {
        workDay: { employeeId },
        status: SegmentStatus.ACTIVE,
      },
      include: {
        project: {
          select: { id: true, code: true, name: true },
        },
        breaks: {
          where: { endTime: null },
        },
      },
    });

    if (!activeSegment) {
      return {
        isClockedIn: false,
        activeSegment: null,
      };
    }

    const now = new Date();
    const elapsedSeconds = Math.floor(
      (now.getTime() - new Date(activeSegment.clockIn).getTime()) / 1000
    );

    const activeBreak = activeSegment.breaks[0] || null;

    return {
      isClockedIn: true,
      activeSegment: {
        id: activeSegment.id,
        projectId: activeSegment.projectId,
        projectName: activeSegment.project.name,
        projectCode: activeSegment.project.code,
        clockIn: activeSegment.clockIn,
        elapsedSeconds,
        isOnBreak: activeBreak !== null,
        activeBreak: activeBreak
          ? {
            id: activeBreak.id,
            breakType: activeBreak.breakType,
            startTime: activeBreak.startTime,
            breakElapsedSeconds: Math.floor(
              (now.getTime() - new Date(activeBreak.startTime).getTime()) / 1000
            ),
          }
          : null,
      },
    };
  }

  /**
   * History & timesheets (From Phase 5)
   */
  async getTimesheetHistory(
    query: TimeHistoryQueryInput,
    userRole: Role,
    userEmployeeId: string
  ) {
    const where: Prisma.WorkDayWhereInput = {};

    // 🔴 Default is ALWAYS the caller's own personal shifts
    if (query.all === 'true' && userRole !== Role.EMPLOYEE) {
      // Management requested company-wide shifts (e.g. for Work Evidence)
      if (query.employeeId) where.employeeId = query.employeeId;
    } else {
      // Personal timesheet view
      where.employeeId = userEmployeeId;
    }

    const workDays = await prisma.workDay.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        segments: {
          orderBy: { clockIn: 'asc' },
          include: {
            project: { select: { id: true, code: true, name: true } },
            breaks: true,
            activities: true,
          },
        },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return workDays;
  }
}

export const timeService = new TimeService();
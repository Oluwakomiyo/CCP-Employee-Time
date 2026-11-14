import { SegmentStatus, DayStatus, CorrectionStatus, AuditAction, Role, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { withEmployeeLock } from './time.totals';

export interface FlagResult {
  flaggedCount: number;
  segmentIds: string[];
}

export class StaleSessionService {
  /**
   * Missing clock-out detection (spec §15, §53). For every segment still ACTIVE after
   * `cutoffHours`, the segment is set aside as AUTO_CLOSED with NO end time and NO duration
   * (nothing is guessed), and the day is flagged MISSING_CLOCK_OUT. The employee must then
   * submit a correction with the real end time. Safe to run any number of times.
   */
  async flagMissingClockOuts(cutoffHours = 16, actorUserId: string | null = null): Promise<FlagResult> {
    const cutoff = new Date(Date.now() - cutoffHours * 60 * 60 * 1000);
    const stale = await prisma.workSegment.findMany({
      where: { status: SegmentStatus.ACTIVE, clockIn: { lte: cutoff } },
      select: { id: true, workDayId: true, clockIn: true, workDay: { select: { employeeId: true } } },
    });

    const segmentIds: string[] = [];
    for (const segment of stale) {
      const flagged = await withEmployeeLock(segment.workDay.employeeId, async (tx) => {
        // Conditional update: if the employee clocked out meanwhile (or another run got here first), skip.
        const res = await tx.workSegment.updateMany({
          where: { id: segment.id, status: SegmentStatus.ACTIVE },
          data: { status: SegmentStatus.AUTO_CLOSED },
        });
        if (res.count !== 1) return false;

        await tx.workDay.update({
          where: { id: segment.workDayId },
          data: { status: DayStatus.MISSING_CLOCK_OUT },
        });
        await tx.auditLog.create({
          data: {
            actorId: actorUserId,
            action: AuditAction.FORCE_CLOCK_OUT,
            entityName: 'WorkSegment',
            entityId: segment.id,
            afterState: {
              event: 'MISSING_CLOCK_OUT',
              clockIn: segment.clockIn.toISOString(),
              clockOut: null,
              note: `No clock-out ${cutoffHours}h after clock-in. End time left blank; a correction is required.`,
            },
          },
        });
        return true;
      });
      if (flagged) segmentIds.push(segment.id);
    }

    return { flaggedCount: segmentIds.length, segmentIds };
  }

  /**
   * Days flagged for a missing clock-out. Employees: own. PMs: own plus employees on projects
   * they lead. CEO: all.
   */
  async getFlaggedWorkDays(userRole: Role, employeeId: string) {
    const where: Prisma.WorkDayWhereInput = { status: DayStatus.MISSING_CLOCK_OUT };
    if (userRole === Role.EMPLOYEE) {
      where.employeeId = employeeId;
    } else if (userRole === Role.PROJECT_MANAGER) {
      where.OR = [
        { employeeId },
        {
          employee: {
            projectMemberships: {
              some: { project: { members: { some: { employeeId, isProjectLead: true } } } },
            },
          },
        },
      ];
    }

    return prisma.workDay.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 200,
      include: {
        employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, department: true } },
        segments: {
          where: { status: SegmentStatus.AUTO_CLOSED, clockOut: null },
          include: { project: { select: { id: true, code: true, name: true } } },
        },
        corrections: { where: { status: CorrectionStatus.PENDING } },
      },
    });
  }
}

export const staleSessionService = new StaleSessionService();

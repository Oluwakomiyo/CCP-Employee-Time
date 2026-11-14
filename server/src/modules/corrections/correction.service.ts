import {
  CorrectionStatus,
  DayStatus,
  SegmentStatus,
  AuditAction,
  Role,
  Prisma,
} from '@prisma/client';
import { prisma, DbClient } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { workDateFor } from '../../utils/time';
import { pmLeadsEmployee } from '../../utils/access';
import {
  CreateCorrectionInput,
  ReviewCorrectionInput,
  QueryCorrectionsInput,
  UpdateCorrectionInput,
} from './correction.schema';

type RequestedChanges = {
  segmentId?: string;
  projectId?: string;
  proposedClockIn: string;
  proposedClockOut: string;
};

type Db = Pick<DbClient, 'workSegment' | 'projectMember'>;

/**
 * Object-level validation of a requested change (fixes IDOR): the segment must belong to this
 * workday, a new segment's project must be assigned to the employee, and times must be sane.
 */
const assertValidChanges = async (
  db: Db,
  workDay: { id: string; employeeId: string; date: Date },
  changes: RequestedChanges
) => {
  if (!!changes.segmentId === !!changes.projectId) {
    throw AppError.badRequest('Specify exactly one of segmentId (fix a segment) or projectId (add a missed segment)');
  }
  if (changes.segmentId) {
    const segment = await db.workSegment.findFirst({ where: { id: changes.segmentId, workDayId: workDay.id } });
    if (!segment) throw AppError.badRequest('The segment does not belong to this workday');
  }
  if (changes.projectId) {
    const member = await db.projectMember.findFirst({
      where: { projectId: changes.projectId, employeeId: workDay.employeeId },
    });
    if (!member) throw AppError.badRequest('The project is not assigned to this employee');
  }
  const clockIn = new Date(changes.proposedClockIn);
  const clockOut = new Date(changes.proposedClockOut);
  if (!(clockOut > clockIn)) throw AppError.badRequest('Clock-out must be after clock-in');
  if (clockOut > new Date()) throw AppError.badRequest('Corrected times cannot be in the future');
  if (workDateFor(clockIn).getTime() !== workDay.date.getTime()) {
    throw AppError.badRequest("The corrected clock-in must fall on the workday's date");
  }
};

export class CorrectionService {
  /**
   * Submit a new correction request for a WorkDay.
   */
  async submitCorrection(
    employeeId: string,
    input: CreateCorrectionInput,
    userId: string
  ) {
    const workDay = await prisma.workDay.findUnique({
      where: { id: input.workDayId },
    });

    if (!workDay) {
      throw AppError.notFound('WorkDay not found');
    }

    if (workDay.employeeId !== employeeId) {
      throw AppError.forbidden('You can only submit corrections for your own workdays');
    }

    await assertValidChanges(prisma, workDay, input.requestedChanges);

    // Prevent duplicate pending requests on the exact same workday
    const existingPending = await prisma.timeCorrectionRequest.findFirst({
      where: {
        workDayId: input.workDayId,
        status: CorrectionStatus.PENDING,
      },
    });

    if (existingPending) {
      throw AppError.conflict(
        'A correction request is already pending review for this workday'
      );
    }

    const correction = await prisma.$transaction(async (tx) => {
      const req = await tx.timeCorrectionRequest.create({
        data: {
          workDayId: input.workDayId,
          employeeId,
          reason: input.reason,
          requestedChanges: input.requestedChanges as unknown as Prisma.JsonObject,
          status: CorrectionStatus.PENDING,
        },
      });

      // Mark the WorkDay as CORRECTION_PENDING if not already flagged
      if (workDay.status !== DayStatus.FLAGGED_MISSING_CLOCKOUT) {
        await tx.workDay.update({
          where: { id: workDay.id },
          data: { status: DayStatus.CORRECTION_PENDING },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: AuditAction.CREATE,
          entityName: 'TimeCorrectionRequest',
          entityId: req.id,
          afterState: {
            workDayId: input.workDayId,
            reason: input.reason,
            requestedChanges: input.requestedChanges,
          },
        },
      });

      return req;
    });

    return correction;
  }

  async updateCorrection(
    correctionId: string,
    input: UpdateCorrectionInput,
    employeeId: string,
    userRole: Role,
    userId: string
  ) {
    const correction = await prisma.timeCorrectionRequest.findUnique({
      where: { id: correctionId },
      include: { workDay: true },
    });
    if (!correction) throw AppError.notFound('Correction request not found');

    // Only the requester edits a request; reviewers approve or reject it.
    void userRole;
    if (correction.employeeId !== employeeId) {
      throw AppError.forbidden('You can only edit your own correction requests');
    }

    if (correction.status !== CorrectionStatus.PENDING) {
      throw AppError.badRequest('Only pending requests can be edited');
    }

    if (input.requestedChanges) {
      await assertValidChanges(prisma, correction.workDay, input.requestedChanges);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.timeCorrectionRequest.update({
        where: { id: correctionId },
        data: {
          reason: input.reason ?? correction.reason,
          requestedChanges: (input.requestedChanges as unknown as Prisma.JsonObject) ?? correction.requestedChanges,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: AuditAction.UPDATE,
          entityName: 'TimeCorrectionRequest',
          entityId: correctionId,
          beforeState: { reason: correction.reason, requestedChanges: correction.requestedChanges } as Prisma.JsonObject,
          afterState: { reason: result.reason, requestedChanges: result.requestedChanges } as Prisma.JsonObject,
        },
      });

      return result;
    });

    return updated;
  }


  /**
   * Review (Approve / Reject) a correction request.
   * Locked down to CEO_ADMIN and PROJECT_MANAGER.
   */
  async reviewCorrection(
    correctionId: string,
    input: ReviewCorrectionInput,
    reviewerUserId: string,
    reviewerRole: Role
  ) {
    const correction = await prisma.timeCorrectionRequest.findUnique({
      where: { id: correctionId },
      include: {
        workDay: {
          include: { segments: true },
        },
        employee: true,
      },
    });

    if (!correction) {
      throw AppError.notFound('Correction request not found');
    }

    if (correction.status !== CorrectionStatus.PENDING) {
      throw AppError.badRequest(
        `Cannot review request with status '${correction.status}'`
      );
    }

    // Invariant: Cannot approve your own correction request
    const reviewerUser = await prisma.user.findUnique({
      where: { id: reviewerUserId },
      include: { employee: true },
    });

    if (reviewerUser?.employee?.id === correction.employeeId) {
      throw AppError.forbidden('Separation of duties: You cannot review your own correction request');
    }

    // PMs review only employees on projects they lead (spec §3).
    if (reviewerRole === Role.PROJECT_MANAGER) {
      if (!reviewerUser?.employee || !(await pmLeadsEmployee(reviewerUser.employee.id, correction.employeeId))) {
        throw AppError.forbidden('You can only review corrections for employees on projects you lead');
      }
    }

    // Claims the request atomically: a second concurrent review finds it no longer PENDING.
    const claim = async (tx: DbClient, status: CorrectionStatus, reviewNotes: string | undefined) => {
      const res = await tx.timeCorrectionRequest.updateMany({
        where: { id: correctionId, status: CorrectionStatus.PENDING },
        data: { status, reviewedById: reviewerUserId, reviewedAt, reviewNotes },
      });
      if (res.count !== 1) throw AppError.conflict('This request has already been reviewed', 'ALREADY_REVIEWED');
    };

    const reviewedAt = new Date();

    if (input.status === CorrectionStatus.REJECTED) {
      // Rejection Workflow
      const rejected = await prisma.$transaction(async (tx) => {
        await claim(tx, CorrectionStatus.REJECTED, input.reviewNotes);
        const updated = await tx.timeCorrectionRequest.findUniqueOrThrow({ where: { id: correctionId } });

        // Revert WorkDay status to CLOSED if it was pending
        if (correction.workDay.status === DayStatus.CORRECTION_PENDING) {
          await tx.workDay.update({
            where: { id: correction.workDayId },
            data: { status: DayStatus.CLOSED },
          });
        }

        await tx.auditLog.create({
          data: {
            actorId: reviewerUserId,
            action: AuditAction.REJECT_CORRECTION,
            entityName: 'TimeCorrectionRequest',
            entityId: correctionId,
            afterState: {
              status: CorrectionStatus.REJECTED,
              notes: input.reviewNotes,
            },
          },
        });

        return updated;
      });

      return rejected;
    }

    // -------------------------------------------------------------------------
    // APPROVAL WORKFLOW: Reconcile underlying segment and workday hours
    // -------------------------------------------------------------------------
    const changes = correction.requestedChanges as RequestedChanges;

    const newClockIn = new Date(changes.proposedClockIn);
    const newClockOut = new Date(changes.proposedClockOut);
    const reconciledDurationSeconds = Math.max(
      0,
      Math.floor((newClockOut.getTime() - newClockIn.getTime()) / 1000)
    );

    const approved = await prisma.$transaction(async (tx) => {
      await claim(tx, CorrectionStatus.APPROVED, input.reviewNotes || 'Approved by management');
      // Re-validate at approval time against current data.
      await assertValidChanges(tx, correction.workDay, changes);

      if (changes.segmentId) {
        // 1. Update existing segment
        await tx.workSegment.update({
          where: { id: changes.segmentId },
          data: {
            clockIn: newClockIn,
            clockOut: newClockOut,
            durationSeconds: reconciledDurationSeconds,
            status: SegmentStatus.COMPLETED,
          },
        });
      } else if (changes.projectId) {
        // 2. Insert missing segment
        await tx.workSegment.create({
          data: {
            workDayId: correction.workDayId,
            projectId: changes.projectId,
            clockIn: newClockIn,
            clockOut: newClockOut,
            durationSeconds: reconciledDurationSeconds,
            status: SegmentStatus.COMPLETED,
          },
        });
      }

      // 3. Recalculate total work seconds across all segments of the WorkDay
      const allCompletedSegments = await tx.workSegment.findMany({
        where: {
          workDayId: correction.workDayId,
          status: { in: [SegmentStatus.COMPLETED, SegmentStatus.AUTO_CLOSED] },
        },
        select: { durationSeconds: true },
      });

      const totalWorkSeconds = allCompletedSegments.reduce(
        (sum, s) => sum + (s.durationSeconds || 0),
        0
      );

      // 4. Update WorkDay status to APPROVED and update work seconds
      await tx.workDay.update({
        where: { id: correction.workDayId },
        data: {
          status: DayStatus.APPROVED,
          totalWorkSeconds,
        },
      });

      // 5. Request was already claimed as APPROVED above
      const updatedReq = await tx.timeCorrectionRequest.findUniqueOrThrow({ where: { id: correctionId } });

      // 6. Record Audit Log
      await tx.auditLog.create({
        data: {
          actorId: reviewerUserId,
          action: AuditAction.APPROVE_CORRECTION,
          entityName: 'TimeCorrectionRequest',
          entityId: correctionId,
          afterState: {
            status: CorrectionStatus.APPROVED,
            reconciledDurationSeconds,
            totalWorkSeconds,
          },
        },
      });

      return updatedReq;
    });

    return approved;
  }

  /**
   * Cancel an unreviewed pending request (Employee self-service).
   */
  async cancelCorrection(correctionId: string, employeeId: string, userId: string) {
    const correction = await prisma.timeCorrectionRequest.findUnique({
      where: { id: correctionId },
    });

    if (!correction) {
      throw AppError.notFound('Correction request not found');
    }

    if (correction.employeeId !== employeeId) {
      throw AppError.forbidden('You can only cancel your own correction requests');
    }

    if (correction.status !== CorrectionStatus.PENDING) {
      throw AppError.badRequest('Only pending requests can be cancelled');
    }

    const cancelled = await prisma.$transaction(async (tx) => {
      const res = await tx.timeCorrectionRequest.updateMany({
        where: { id: correctionId, status: CorrectionStatus.PENDING },
        data: { status: CorrectionStatus.CANCELLED },
      });
      if (res.count !== 1) throw AppError.conflict('This request is no longer pending');
      const updated = await tx.timeCorrectionRequest.findUniqueOrThrow({ where: { id: correctionId } });

      const remaining = await tx.timeCorrectionRequest.count({
        where: { workDayId: correction.workDayId, status: CorrectionStatus.PENDING },
      });
      if (remaining === 0) {
        await tx.workDay.updateMany({
          where: { id: correction.workDayId, status: DayStatus.CORRECTION_PENDING },
          data: { status: DayStatus.CLOSED },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: AuditAction.UPDATE,
          entityName: 'TimeCorrectionRequest',
          entityId: correctionId,
          afterState: { status: CorrectionStatus.CANCELLED },
        },
      });

      return updated;
    });

    return cancelled;
  }

  /**
   * List correction requests with role-based scoping:
   * - Employees see their own.
   * - PM & CEO see all requests.
   */
  async listCorrections(
    query: QueryCorrectionsInput,
    userRole: Role,
    userEmployeeId: string
  ) {
    const { page, limit, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TimeCorrectionRequestWhereInput = {};

    if (userRole === Role.EMPLOYEE) {
      where.employeeId = userEmployeeId;
    } else {
      if (query.employeeId) where.employeeId = query.employeeId;
      if (userRole === Role.PROJECT_MANAGER) {
        // Own requests, plus employees on projects this PM leads.
        where.OR = [
          { employeeId: userEmployeeId },
          {
            employee: {
              projectMemberships: {
                some: { project: { members: { some: { employeeId: userEmployeeId, isProjectLead: true } } } },
              },
            },
          },
        ];
      }
    }

    if (status) {
      where.status = status;
    }

    const [total, items] = await prisma.$transaction([
      prisma.timeCorrectionRequest.count({ where }),
      prisma.timeCorrectionRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              department: true,
            },
          },
          workDay: {
            select: {
              id: true,
              date: true,
              status: true,
              totalWorkSeconds: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              email: true,
              role: true,
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

export const correctionService = new CorrectionService();
import {
  CorrectionStatus,
  DayStatus,
  SegmentStatus,
  AuditAction,
  Role,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import {
  CreateCorrectionInput,
  ReviewCorrectionInput,
  QueryCorrectionsInput,
  UpdateCorrectionInput,
} from './correction.schema';

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
    const correction = await prisma.timeCorrectionRequest.findUnique({ where: { id: correctionId } });
    if (!correction) throw AppError.notFound('Correction request not found');

    if (userRole !== Role.CEO_ADMIN && correction.employeeId !== employeeId) {
      throw AppError.forbidden('You can only edit your own correction requests');
    }

    if (correction.status !== CorrectionStatus.PENDING) {
      throw AppError.badRequest('Only pending requests can be edited');
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
        },
      });

      return result;
    });

    return updated;
  }

  async deleteCorrection(correctionId: string, employeeId: string, userRole: Role, userId: string) {
    const correction = await prisma.timeCorrectionRequest.findUnique({
      where: { id: correctionId },
      include: { workDay: true },
    });
    if (!correction) throw AppError.notFound('Correction request not found');

    if (userRole !== Role.CEO_ADMIN && correction.employeeId !== employeeId) {
      throw AppError.forbidden('You can only delete your own correction requests');
    }

    if (userRole !== Role.CEO_ADMIN && correction.status === CorrectionStatus.APPROVED) {
      throw AppError.badRequest('Approved corrections cannot be deleted');
    }

    await prisma.$transaction(async (tx) => {
      await tx.timeCorrectionRequest.delete({ where: { id: correctionId } });

      const remaining = await tx.timeCorrectionRequest.findFirst({
        where: { workDayId: correction.workDayId, status: CorrectionStatus.PENDING },
      });

      if (!remaining && correction.workDay.status === DayStatus.CORRECTION_PENDING) {
        await tx.workDay.update({
          where: { id: correction.workDayId },
          data: { status: DayStatus.CLOSED },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: AuditAction.DELETE,
          entityName: 'TimeCorrectionRequest',
          entityId: correctionId,
        },
      });
    });

    return { message: 'Correction request deleted successfully' };
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

    const reviewedAt = new Date();

    if (input.status === CorrectionStatus.REJECTED) {
      // Rejection Workflow
      const rejected = await prisma.$transaction(async (tx) => {
        const updated = await tx.timeCorrectionRequest.update({
          where: { id: correctionId },
          data: {
            status: CorrectionStatus.REJECTED,
            reviewedById: reviewerUserId,
            reviewedAt,
            reviewNotes: input.reviewNotes,
          },
        });

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
    const changes = correction.requestedChanges as {
      segmentId?: string;
      projectId?: string;
      proposedClockIn: string;
      proposedClockOut: string;
    };

    const newClockIn = new Date(changes.proposedClockIn);
    const newClockOut = new Date(changes.proposedClockOut);
    const reconciledDurationSeconds = Math.max(
      0,
      Math.floor((newClockOut.getTime() - newClockIn.getTime()) / 1000)
    );

    const approved = await prisma.$transaction(async (tx) => {
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

      // 5. Update the Correction Request
      const updatedReq = await tx.timeCorrectionRequest.update({
        where: { id: correctionId },
        data: {
          status: CorrectionStatus.APPROVED,
          reviewedById: reviewerUserId,
          reviewedAt,
          reviewNotes: input.reviewNotes || 'Approved by management',
        },
      });

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
      const updated = await tx.timeCorrectionRequest.update({
        where: { id: correctionId },
        data: { status: CorrectionStatus.CANCELLED },
      });

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
    } else if (query.employeeId) {
      where.employeeId = query.employeeId;
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
import { Prisma, DayStatus, AuditAction, Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { GeneratePayrollInput, QueryPayrollInput } from './payroll.schema';

export class PayrollService {
  /**
   * Generates payroll records for approved workdays in a period.
   * Strictly CEO_ADMIN only.
   */
  async generatePayroll(input: GeneratePayrollInput, actorUserId: string) {
    const startDate = new Date(input.periodStart);
    const endDate = new Date(input.periodEnd);

    // 1. Identify Target Employees
    const employeeFilter: Prisma.EmployeeWhereInput = {
      status: 'ACTIVE',
    };
    if (input.employeeId) {
      employeeFilter.id = input.employeeId;
    }

    const employees = await prisma.employee.findMany({
      where: employeeFilter,
      include: {
        compensation: true,
      },
    });

    if (employees.length === 0) {
      throw AppError.notFound('No active employees found for the specified criteria');
    }

    const generatedRecords = [];

    for (const emp of employees) {
      if (!emp.compensation) {
        continue; // Skip employee if no compensation package is configured
      }

      // 2. Fetch all approved/closed workdays within the period
      const workDays = await prisma.workDay.findMany({
        where: {
          employeeId: emp.id,
          date: {
            gte: startDate,
            lte: endDate,
          },
          status: { in: [DayStatus.APPROVED, DayStatus.CLOSED] },
        },
      });

      let totalRegularSeconds = 0;
      let totalOvertimeSeconds = 0;
      const standardDaySeconds = 8 * 3600; // 8 hours standard day

      // 3. Compute Regular vs Overtime per WorkDay
      for (const day of workDays) {
        // Net worked time = totalWorkSeconds (recorded breaks already subtracted or excluded)
        const netSeconds = Math.max(0, day.totalWorkSeconds - day.totalBreakSeconds);

        if (netSeconds <= standardDaySeconds) {
          totalRegularSeconds += netSeconds;
        } else {
          totalRegularSeconds += standardDaySeconds;
          totalOvertimeSeconds += netSeconds - standardDaySeconds;
        }
      }

      // Convert seconds to decimal hours (rounded to 2 decimal places)
      const regularHoursNum = Math.round((totalRegularSeconds / 3600) * 100) / 100;
      const overtimeHoursNum = Math.round((totalOvertimeSeconds / 3600) * 100) / 100;

      const regularHours = new Prisma.Decimal(regularHoursNum);
      const overtimeHours = new Prisma.Decimal(overtimeHoursNum);

      const baseRate = emp.compensation.baseHourlyRate;
      const otRate = emp.compensation.overtimeHourlyRate;

      // Gross Pay = (regularHours * baseRate) + (overtimeHours * otRate)
      const grossPay = regularHours.mul(baseRate).add(overtimeHours.mul(otRate));

      // 4. Upsert Payroll Record (Period unique per employee)
      const record = await prisma.payrollRecord.upsert({
        where: {
          employeeId_periodStart_periodEnd: {
            employeeId: emp.id,
            periodStart: startDate,
            periodEnd: endDate,
          },
        },
        create: {
          employeeId: emp.id,
          periodStart: startDate,
          periodEnd: endDate,
          regularHours,
          overtimeHours,
          grossPay,
          currency: emp.compensation.currency,
        },
        update: {
          regularHours,
          overtimeHours,
          grossPay,
          generatedAt: new Date(),
        },
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
        },
      });

      generatedRecords.push(record);
    }

    // 5. Immutable Audit Log
    await prisma.auditLog.create({
      data: {
        actorId: actorUserId,
        action: AuditAction.CREATE,
        entityName: 'PayrollRecord',
        entityId: input.periodStart,
        afterState: {
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          recordsGenerated: generatedRecords.length,
        },
      },
    });

    return generatedRecords;
  }

  /**
   * List all company payroll records (CEO_ADMIN only).
   */
  async listPayrollRecords(query: QueryPayrollInput) {
    const { page, limit, employeeId, periodStart, periodEnd } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PayrollRecordWhereInput = {};
    if (employeeId) where.employeeId = employeeId;
    if (periodStart) where.periodStart = { gte: new Date(periodStart) };
    if (periodEnd) where.periodEnd = { lte: new Date(periodEnd) };

    const [total, items] = await prisma.$transaction([
      prisma.payrollRecord.count({ where }),
      prisma.payrollRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { periodStart: 'desc' },
        include: {
          employee: {
            include: {
              compensation: true,
              workDays: {
                include: {
                  segments: {
                    where: { status: { in: ['COMPLETED', 'AUTO_CLOSED'] } },
                    include: { project: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    // Compute itemized project breakdown for each payroll record
    const enriched = items.map((rec) => {
      const projectMap = new Map<string, { projectCode: string; projectName: string; hours: number; amount: number }>();
      const baseRate = Number(rec.employee.compensation?.baseHourlyRate || 0);

      for (const day of rec.employee.workDays) {
        if (new Date(day.date) >= new Date(rec.periodStart) && new Date(day.date) <= new Date(rec.periodEnd)) {
          for (const seg of day.segments) {
            const pId = seg.projectId;
            const hrs = (seg.durationSeconds || 0) / 3600;

            if (!projectMap.has(pId)) {
              projectMap.set(pId, {
                projectCode: seg.project.code,
                projectName: seg.project.name,
                hours: 0,
                amount: 0,
              });
            }

            const entry = projectMap.get(pId)!;
            entry.hours += hrs;
            entry.amount += hrs * baseRate;
          }
        }
      }

      return {
        ...rec,
        projectBreakdown: Array.from(projectMap.values()).map((p) => ({
          ...p,
          hours: Math.round(p.hours * 100) / 100,
          amount: Math.round(p.amount * 100) / 100,
        })),
      };
    });

    return {
      data: enriched,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Employee self-service: View own pay stubs.
   */
  async getMyPaySlips(employeeId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: Prisma.PayrollRecordWhereInput = { employeeId };

    const [total, items] = await prisma.$transaction([
      prisma.payrollRecord.count({ where }),
      prisma.payrollRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { periodStart: 'desc' },
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

export const payrollService = new PayrollService();
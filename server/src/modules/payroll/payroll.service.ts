import { Prisma, DayStatus, AuditAction } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { GeneratePayrollInput, QueryPayrollInput } from './payroll.schema';
import { rateOn } from '../employees/compensation';

export class PayrollService {
  /**
   * Generates payroll records for approved workdays in a period.
   * Strictly CEO_ADMIN only.
   */
  async generatePayroll(input: GeneratePayrollInput, actorUserId: string) {
    const startDate = new Date(input.periodStart);
    const endDate = new Date(input.periodEnd);

    // 1. Everyone who worked in the period, including people who have since left.
    const employeeFilter: Prisma.EmployeeWhereInput = {
      workDays: { some: { date: { gte: startDate, lte: endDate } } },
    };
    if (input.employeeId) {
      employeeFilter.id = input.employeeId;
    }

    const employees = await prisma.employee.findMany({
      where: employeeFilter,
      include: {
        compensations: { orderBy: { effectiveFrom: 'asc' } },
      },
    });

    if (employees.length === 0) {
      throw AppError.notFound('No employees worked in the specified period');
    }

    const generatedRecords = [];
    const daysWithoutRate: { employeeId: string; date: string }[] = [];

    for (const emp of employees) {

      // 2. Fetch all approved/closed workdays within the period
      const workDays = await prisma.workDay.findMany({
        where: {
          employeeId: emp.id,
          date: {
            gte: startDate,
            lte: endDate,
          },
          status: { in: [DayStatus.CORRECTED, DayStatus.COMPLETED] },
        },
      });

      let totalRegularSeconds = 0;
      let totalOvertimeSeconds = 0;
      let grossPay = new Prisma.Decimal(0);
      let currency: string | null = null;
      const standardDaySeconds = 8 * 3600; // shortcut: fixed 8h/day overtime threshold until a policy exists (spec §32)

      // 3. Regular vs overtime per day, each day priced at the rate in force that day (spec §20).
      for (const day of workDays) {
        const rate = rateOn(emp.compensations, day.date);
        if (!rate) {
          daysWithoutRate.push({ employeeId: emp.id, date: day.date.toISOString().slice(0, 10) });
          continue;
        }
        // Net working time = presence minus recorded (unpaid) breaks.
        const netSeconds = Math.max(0, day.totalWorkSeconds - day.totalBreakSeconds);
        const regular = Math.min(netSeconds, standardDaySeconds);
        const overtime = netSeconds - regular;
        totalRegularSeconds += regular;
        totalOvertimeSeconds += overtime;
        grossPay = grossPay
          .add(new Prisma.Decimal(regular).div(3600).mul(rate.baseHourlyRate))
          .add(new Prisma.Decimal(overtime).div(3600).mul(rate.overtimeHourlyRate));
        currency = rate.currency;
      }
      if (!currency) continue; // no priced days for this employee

      const regularHours = new Prisma.Decimal(totalRegularSeconds).div(3600).toDecimalPlaces(2);
      const overtimeHours = new Prisma.Decimal(totalOvertimeSeconds).div(3600).toDecimalPlaces(2);
      grossPay = grossPay.toDecimalPlaces(2);

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
          currency,
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

    // shortcut: response shape kept as an array for the legacy client; days without a rate are logged.
    if (daysWithoutRate.length) console.warn('[payroll] days without a configured rate:', daysWithoutRate);
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
              compensations: true,
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

      for (const day of rec.employee.workDays) {
        if (new Date(day.date) >= new Date(rec.periodStart) && new Date(day.date) <= new Date(rec.periodEnd)) {
          for (const seg of day.segments) {
            const pId = seg.projectId;
            const hrs = (seg.durationSeconds || 0) / 3600;
            const baseRate = Number(rateOn(rec.employee.compensations, day.date)?.baseHourlyRate ?? 0);

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
}

export const payrollService = new PayrollService();
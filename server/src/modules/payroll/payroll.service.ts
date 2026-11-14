import { Prisma, DayStatus, AuditAction, PayrollStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { GeneratePayrollInput, PeriodInput, QueryPayrollInput } from './payroll.schema';
import { rateOn } from '../employees/compensation';
import { netSeconds } from '../reports/aggregate';

/** Days that count for pay: finished or corrected (spec §104: payroll uses official time). */
const PAYABLE: DayStatus[] = [DayStatus.CORRECTED, DayStatus.COMPLETED];
/** Days that block finalizing a period until they are resolved. */
const UNRESOLVED: DayStatus[] = [DayStatus.OPEN, DayStatus.MISSING_CLOCK_OUT, DayStatus.CORRECTION_PENDING];

// shortcut: fixed 8h/day overtime threshold until the business sets a policy (spec §32).
const STANDARD_DAY_SECONDS = 8 * 3600;

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const employeeSummary = { id: true, employeeCode: true, firstName: true, lastName: true, department: true } as const;

export class PayrollService {
  /**
   * Generates DRAFT payroll for everyone who worked in the period (including people who have
   * since left). Each day is priced at the rate in force that day. FINALIZED records are never
   * touched. All-or-nothing: one transaction.
   */
  async generatePayroll(input: GeneratePayrollInput, actorUserId: string) {
    const periodStart = day(input.periodStart);
    const periodEnd = day(input.periodEnd);

    const employees = await prisma.employee.findMany({
      where: {
        workDays: { some: { date: { gte: periodStart, lte: periodEnd } } },
        ...(input.employeeId ? { id: input.employeeId } : {}),
      },
      include: {
        compensations: { orderBy: { effectiveFrom: 'asc' } },
        workDays: { where: { date: { gte: periodStart, lte: periodEnd }, status: { in: PAYABLE } } },
      },
    });
    if (employees.length === 0) throw AppError.notFound('No employees worked in the specified period');

    // A period may be regenerated, but must not overlap a different period for the same person.
    const overlapping = await prisma.payrollRecord.findFirst({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
        NOT: { periodStart, periodEnd },
      },
      select: { periodStart: true, periodEnd: true },
    });
    if (overlapping) {
      throw AppError.conflict(
        `This period overlaps an existing payroll period (${overlapping.periodStart.toISOString().slice(0, 10)} to ${overlapping.periodEnd.toISOString().slice(0, 10)})`,
        'OVERLAPPING_PERIOD'
      );
    }

    const daysWithoutRate: { employeeId: string; date: string }[] = [];
    const rows = employees.flatMap((emp) => {
      let regular = 0;
      let overtime = 0;
      let gross = new Prisma.Decimal(0);
      let currency: string | null = null;
      for (const d of emp.workDays) {
        const rate = rateOn(emp.compensations, d.date);
        if (!rate) {
          daysWithoutRate.push({ employeeId: emp.id, date: d.date.toISOString().slice(0, 10) });
          continue;
        }
        const net = Math.max(0, d.totalWorkSeconds - d.totalBreakSeconds);
        const reg = Math.min(net, STANDARD_DAY_SECONDS);
        regular += reg;
        overtime += net - reg;
        gross = gross
          .add(new Prisma.Decimal(reg).div(3600).mul(rate.baseHourlyRate))
          .add(new Prisma.Decimal(net - reg).div(3600).mul(rate.overtimeHourlyRate));
        currency = rate.currency;
      }
      if (!currency) return [];
      return [
        {
          employeeId: emp.id,
          regularHours: new Prisma.Decimal(regular).div(3600).toDecimalPlaces(2),
          overtimeHours: new Prisma.Decimal(overtime).div(3600).toDecimalPlaces(2),
          grossPay: gross.toDecimalPlaces(2),
          currency,
        },
      ];
    });

    const { records, skippedFinalized } = await prisma.$transaction(
      async (tx) => {
        const records = [];
        let skippedFinalized = 0;
        for (const row of rows) {
          const key = { employeeId_periodStart_periodEnd: { employeeId: row.employeeId, periodStart, periodEnd } };
          const existing = await tx.payrollRecord.findUnique({ where: key, select: { status: true } });
          if (existing?.status === PayrollStatus.FINALIZED) {
            skippedFinalized += 1;
            continue;
          }
          records.push(
            await tx.payrollRecord.upsert({
              where: key,
              create: { ...row, periodStart, periodEnd },
              update: { ...row, generatedAt: new Date() },
              include: { employee: { select: employeeSummary } },
            })
          );
        }
        await tx.auditLog.create({
          data: {
            actorId: actorUserId,
            action: AuditAction.CREATE,
            entityName: 'PayrollRun',
            entityId: `${input.periodStart}_${input.periodEnd}`,
            afterState: {
              event: 'PAYROLL_GENERATED',
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
              recordsGenerated: records.length,
              skippedFinalized,
              daysWithoutRate: daysWithoutRate.length,
            },
          },
        });
        return { records, skippedFinalized };
      },
      { timeout: 30_000 }
    );

    return { records, skippedFinalized, daysWithoutRate };
  }

  /**
   * Locks a period's DRAFT records. Refused while anyone has unresolved days in the period
   * (open, missing clock-out or correction pending), so nobody is paid on incomplete time.
   */
  async finalizePeriod(input: PeriodInput, actorUserId: string) {
    const periodStart = day(input.periodStart);
    const periodEnd = day(input.periodEnd);

    const unresolved = await prisma.workDay.findMany({
      where: { date: { gte: periodStart, lte: periodEnd }, status: { in: UNRESOLVED } },
      select: { date: true, status: true, employee: { select: employeeSummary } },
      orderBy: { date: 'asc' },
      take: 50,
    });
    if (unresolved.length) {
      throw new AppError('Resolve these days before finalizing payroll', 409, { unresolved }, 'UNRESOLVED_DAYS');
    }

    const finalizedAt = new Date();
    return prisma.$transaction(async (tx) => {
      const res = await tx.payrollRecord.updateMany({
        where: { periodStart, periodEnd, status: PayrollStatus.DRAFT },
        data: { status: PayrollStatus.FINALIZED, finalizedAt, finalizedById: actorUserId },
      });
      if (res.count === 0) throw AppError.notFound('No draft payroll records for this period');
      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          action: AuditAction.UPDATE,
          entityName: 'PayrollRun',
          entityId: `${input.periodStart}_${input.periodEnd}`,
          afterState: { event: 'PAYROLL_FINALIZED', records: res.count },
        },
      });
      return { finalized: res.count, finalizedAt };
    });
  }

  /** CSV of a period's payroll (spec §79 "payroll export"). */
  async exportCsv(input: PeriodInput) {
    const records = await prisma.payrollRecord.findMany({
      where: { periodStart: day(input.periodStart), periodEnd: day(input.periodEnd) },
      include: { employee: { select: employeeSummary } },
      orderBy: { employee: { employeeCode: 'asc' } },
    });
    const cell = (v: unknown) => {
      const s = String(v ?? '');
      // Quote when needed; neutralise spreadsheet formula injection.
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const header = ['employeeCode', 'firstName', 'lastName', 'department', 'periodStart', 'periodEnd', 'regularHours', 'overtimeHours', 'grossPay', 'currency', 'status'];
    const lines = records.map((r) =>
      [
        r.employee.employeeCode,
        r.employee.firstName,
        r.employee.lastName,
        r.employee.department,
        input.periodStart,
        input.periodEnd,
        r.regularHours.toFixed(2),
        r.overtimeHours.toFixed(2),
        r.grossPay.toFixed(2),
        r.currency,
        r.status,
      ]
        .map(cell)
        .join(',')
    );
    return [header.join(','), ...lines].join('\n') + '\n';
  }

  /**
   * Lists payroll records (CEO only) with a per-project breakdown of each record's hours and
   * base-rate amount (net of breaks, rate in force per day). Loads only the periods' segments.
   */
  async listPayrollRecords(query: QueryPayrollInput) {
    const { page, limit, employeeId, periodStart, periodEnd, status } = query;
    const where: Prisma.PayrollRecordWhereInput = {};
    if (employeeId) where.employeeId = employeeId;
    if (periodStart) where.periodStart = { gte: day(periodStart) };
    if (periodEnd) where.periodEnd = { lte: day(periodEnd) };
    if (status) where.status = status;

    const [total, items] = await prisma.$transaction([
      prisma.payrollRecord.count({ where }),
      prisma.payrollRecord.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ periodStart: 'desc' }, { employee: { employeeCode: 'asc' } }],
        include: { employee: { select: { ...employeeSummary, compensations: true } } },
      }),
    ]);

    const segments = items.length
      ? await prisma.workSegment.findMany({
          where: {
            OR: items.map((r) => ({
              workDay: { employeeId: r.employeeId, date: { gte: r.periodStart, lte: r.periodEnd }, status: { in: PAYABLE } },
            })),
          },
          include: {
            breaks: { select: { startTime: true, endTime: true } },
            activities: { select: { activityType: true, startTime: true, endTime: true } },
            project: { select: { code: true, name: true } },
            workDay: { select: { employeeId: true, date: true } },
          },
        })
      : [];

    const now = new Date();
    const data = items.map(({ employee: { compensations, ...employee }, ...rec }) => {
      const projects = new Map<string, { projectCode: string; projectName: string; hours: number; amount: number }>();
      for (const s of segments) {
        if (s.workDay.employeeId !== rec.employeeId || s.workDay.date < rec.periodStart || s.workDay.date > rec.periodEnd) continue;
        const hrs = netSeconds(s, now) / 3600;
        const rate = Number(rateOn(compensations, s.workDay.date)?.baseHourlyRate ?? 0);
        const entry = projects.get(s.projectId) ?? { projectCode: s.project.code, projectName: s.project.name, hours: 0, amount: 0 };
        entry.hours += hrs;
        entry.amount += hrs * rate;
        projects.set(s.projectId, entry);
      }
      return {
        ...rec,
        employee,
        projectBreakdown: [...projects.values()].map((p) => ({
          ...p,
          hours: Math.round(p.hours * 100) / 100,
          amount: Math.round(p.amount * 100) / 100,
        })),
      };
    });

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}

export const payrollService = new PayrollService();

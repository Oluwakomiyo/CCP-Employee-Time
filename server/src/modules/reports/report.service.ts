import { DayStatus, Prisma, ProjectStatus, SegmentStatus, CorrectionStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { secondsBetween } from '../time/time.totals';
import { AppError } from '../../errors/AppError';
import { workDateFor } from '../../utils/time';
import { assertCanSee, assertProjectInScope, visibleEmployeeIds } from '../../utils/access';
import { AuthUser, can } from '../../auth/can';
import { rateOn } from '../employees/compensation';
import { activitySeconds, breakSeconds, bump, hours, netSeconds, presenceSeconds, toHoursList } from './aggregate';

export interface DateRange {
  from?: string; // YYYY-MM-DD (company dates)
  to?: string;
}

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dateFilter = (r: DateRange): Prisma.DateTimeFilter | undefined =>
  r.from || r.to ? { ...(r.from ? { gte: day(r.from) } : {}), ...(r.to ? { lte: day(r.to) } : {}) } : undefined;

/** Last `n` days ending today (company timezone). */
export const lastDays = (n: number): Required<DateRange> => {
  const to = workDateFor(new Date());
  return { from: iso(new Date(to.getTime() - (n - 1) * 86_400_000)), to: iso(to) };
};

/** Days that count toward averages (spec §36): finished or corrected, with time worked. */
const VALID_DAY: DayStatus[] = [DayStatus.COMPLETED, DayStatus.CORRECTED];

const segmentInclude = {
  breaks: { select: { startTime: true, endTime: true } },
  activities: { select: { activityType: true, startTime: true, endTime: true } },
  project: { select: { id: true, code: true, name: true } },
  workDay: { select: { id: true, employeeId: true, date: true, status: true } },
} satisfies Prisma.WorkSegmentInclude;

const loadSegments = (where: Prisma.WorkSegmentWhereInput) =>
  prisma.workSegment.findMany({ where, include: segmentInclude, orderBy: { clockIn: 'asc' } });

type LoadedSegment = Awaited<ReturnType<typeof loadSegments>>[number];


const employeeFilter = (ids: string[] | null): Prisma.EmployeeWhereInput => (ids ? { id: { in: ids } } : {});

/** Per-day net hours and per-dimension totals for a set of segments. */
const summarise = (segments: LoadedSegment[], now: Date) => {
  const byProject = new Map<string, number>();
  const byActivity = new Map<string, number>();
  const byLocation = new Map<string, number>();
  const byDay = new Map<string, number>();
  const byEmployee = new Map<string, number>();
  let total = 0;
  let breaks = 0;
  let presence = 0;
  for (const s of segments) {
    const net = netSeconds(s, now);
    total += net;
    breaks += breakSeconds(s, now);
    presence += presenceSeconds(s, now);
    bump(byProject, s.projectId, net);
    bump(byLocation, s.location, net);
    bump(byDay, iso(s.workDay.date), net);
    bump(byEmployee, s.workDay.employeeId, net);
    for (const [type, secs] of activitySeconds(s, now)) bump(byActivity, type, secs);
  }
  return { total, breaks, presence, byProject, byActivity, byLocation, byDay, byEmployee };
};

const projectNames = (segments: LoadedSegment[]) =>
  new Map(segments.map((s) => [s.projectId, { projectId: s.project.id, code: s.project.code, name: s.project.name }]));

export class ReportService {
  /**
   * Net hours worked per project (all time), with the same maths as the project report.
   * shortcut: loads every segment of the listed projects; fine at CCP's size, move to SQL
   * aggregation if a project list page ever spans thousands of segments.
   */
  async hoursForProjects(projectIds: string[]) {
    if (!projectIds.length) return new Map<string, number>();
    const byProject = summarise(await loadSegments({ projectId: { in: projectIds } }), new Date()).byProject;
    return new Map(projectIds.map((id) => [id, hours(byProject.get(id) ?? 0)]));
  }

  /**
   * GET /management/employees/:id/workdays?date=: one day with its segments,
   * so the evidence screen can resolve a workday id for an employee and date.
   */
  async findWorkDay(user: AuthUser, employeeId: string, date: string) {
    await assertCanSee(user, ['evidence.view', 'timesheets.view'], employeeId);
    const workDay = await prisma.workDay.findUnique({
      where: { employeeId_date: { employeeId, date: new Date(`${date}T00:00:00.000Z`) } },
      select: {
        id: true,
        date: true,
        status: true,
        segments: {
          orderBy: { clockIn: 'asc' },
          select: {
            id: true,
            clockIn: true,
            clockOut: true,
            location: true,
            project: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    return { workDay };
  }

  /** GET /management/employees/:id/report and GET /me/report. Never includes money. */
  async employeeReport(user: AuthUser, employeeId: string, range: DateRange) {
    await assertCanSee(user, 'reports.view', employeeId);
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, department: true, position: true, status: true },
    });
    if (!employee) throw AppError.notFound('Employee not found');

    const date = dateFilter(range);
    const now = new Date();
    const segments = await loadSegments({ workDay: { employeeId, ...(date ? { date } : {}) } });
    const sum = summarise(segments, now);
    const names = projectNames(segments);

    const validDays = new Map<string, number>();
    for (const s of segments) {
      if (VALID_DAY.includes(s.workDay.status)) bump(validDays, iso(s.workDay.date), netSeconds(s, now));
    }
    const workedDays = [...validDays.values()].filter((v) => v > 0);

    const [missingClockOuts, corrections] = await Promise.all([
      prisma.workDay.count({ where: { employeeId, status: DayStatus.MISSING_CLOCK_OUT, ...(date ? { date } : {}) } }),
      prisma.timeCorrectionRequest.groupBy({
        by: ['status'],
        where: { employeeId, ...(date ? { workDay: { date } } : {}) },
        _count: true,
      }),
    ]);

    return {
      employee,
      range,
      totalWorkingHours: hours(sum.total),
      presenceHours: hours(sum.presence),
      breakHours: hours(sum.breaks),
      validWorkingDays: workedDays.length,
      averageDailyHours: workedDays.length ? hours(workedDays.reduce((a, b) => a + b, 0) / workedDays.length) : 0,
      projectsWorked: names.size,
      hoursByProject: [...sum.byProject.entries()]
        .map(([id, s]) => ({ ...names.get(id)!, hours: hours(s) }))
        .sort((a, b) => b.hours - a.hours),
      hoursByActivity: toHoursList(sum.byActivity, 'activityType'),
      hoursByLocation: toHoursList(sum.byLocation, 'location'),
      dailyHours: [...sum.byDay.entries()].map(([date, s]) => ({ date, hours: hours(s) })),
      missingClockOuts,
      correctionRequests: Object.fromEntries(corrections.map((c) => [c.status, c._count])),
    };
  }

  /** GET /management/projects/:id/report. Labour cost only for the CEO (spec §33, §34). */
  async projectReport(user: AuthUser, projectId: string, range: DateRange) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          where: { removedAt: null },
          select: { isProjectLead: true, employee: { select: { id: true, firstName: true, lastName: true, department: true } } },
        },
      },
    });
    if (!project) throw AppError.notFound('Project not found');
    await assertProjectInScope(user, 'reports.view', projectId);
    // Labour cost needs compensation.view (spec §4).
    const isCeo = can(user, 'compensation.view');

    const date = dateFilter(range);
    const now = new Date();
    const segments = await loadSegments({ projectId, ...(date ? { workDay: { date } } : {}) });
    const sum = summarise(segments, now);

    const employeeIds = [...sum.byEmployee.keys()];
    const people = await prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        compensations: isCeo ? { orderBy: { effectiveFrom: 'asc' } } : false,
      },
    });
    const byId = new Map(people.map((p) => [p.id, p]));

    // Cost: each segment's net hours at the rate in force on its day (spec §20, §33).
    const costByEmployee = new Map<string, number>();
    if (isCeo) {
      for (const s of segments) {
        const rate = rateOn(byId.get(s.workDay.employeeId)?.compensations ?? [], s.workDay.date);
        bump(costByEmployee, s.workDay.employeeId, (netSeconds(s, now) / 3600) * Number(rate?.baseHourlyRate ?? 0));
      }
    }
    const round2 = (n: number) => Math.round(n * 100) / 100;

    const estimated = project.estimatedHours?.toNumber() ?? null;
    const actual = hours(sum.total);
    const { members, ...info } = project;

    return {
      project: info,
      range,
      assignedEmployees: members.map((m) => ({ ...m.employee, isProjectLead: m.isProjectLead })),
      currentWorkers: await this.currentWorkers({ projectId }),
      totalHours: actual,
      estimatedHours: estimated,
      remainingEstimatedHours: estimated === null ? null : Math.max(0, round2(estimated - actual)),
      overEstimate: estimated !== null && actual > estimated,
      overByHours: estimated !== null && actual > estimated ? round2(actual - estimated) : 0,
      hoursByEmployee: employeeIds
        .map((id) => {
          const p = byId.get(id);
          return {
            employeeId: id,
            employeeCode: p?.employeeCode,
            name: p ? `${p.firstName} ${p.lastName}` : 'Unknown',
            hours: hours(sum.byEmployee.get(id)!),
            ...(isCeo ? { labourCost: round2(costByEmployee.get(id) ?? 0) } : {}),
          };
        })
        .sort((a, b) => b.hours - a.hours),
      hoursByActivity: toHoursList(sum.byActivity, 'activityType'),
      hoursByLocation: toHoursList(sum.byLocation, 'location'),
      timeline: [...sum.byDay.entries()].map(([date, s]) => ({ date, hours: hours(s) })),
      ...(isCeo ? { labourCost: round2([...costByEmployee.values()].reduce((a, b) => a + b, 0)) } : {}),
    };
  }

  /** Who is working right now (spec §47). Optionally limited to one project or to visible employees. */
  async currentWorkers(filter: { projectId?: string; employeeIds?: string[] | null }) {
    const now = new Date();
    const active = await prisma.workSegment.findMany({
      where: {
        status: SegmentStatus.ACTIVE,
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.employeeIds ? { workDay: { employeeId: { in: filter.employeeIds } } } : {}),
      },
      include: {
        project: { select: { id: true, code: true, name: true } },
        breaks: { where: { endTime: null }, select: { breakType: true, startTime: true } },
        activities: { where: { endTime: null }, select: { activityType: true, notes: true } },
        workDay: { select: { employee: { select: { id: true, firstName: true, lastName: true, department: true } } } },
      },
    });
    return active.map((s) => {
      const since = s.breaks[0]?.startTime ?? s.clockIn;
      return {
        employee: s.workDay.employee,
        state: s.breaks.length ? 'ON_BREAK' : 'WORKING',
        project: s.project,
        location: s.location,
        activity: s.activities[0]?.activityType ?? null,
        breakType: s.breaks[0]?.breakType ?? null,
        since,
        // Time in the current state: on a break, since the break started; working, since the segment started.
        sinceSeconds: secondsBetween(since, now),
        segmentSeconds: secondsBetween(s.clockIn, now),
      };
    });
  }

  /** GET /management/status: every visible active employee with a state (spec §47). */
  async liveStatus(user: AuthUser) {
    const ids = await visibleEmployeeIds(user, 'live.view');
    const [employees, working, today] = await Promise.all([
      prisma.employee.findMany({
        where: { status: 'ACTIVE', ...employeeFilter(ids) },
        select: { id: true, firstName: true, lastName: true, department: true, position: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.currentWorkers({ employeeIds: ids }),
      prisma.workDay.findMany({
        where: { date: workDateFor(new Date()), ...(ids ? { employeeId: { in: ids } } : {}) },
        select: { employeeId: true, status: true },
      }),
    ]);
    const live = new Map(working.map((w) => [w.employee.id, w]));
    const dayStatus = new Map(today.map((d) => [d.employeeId, d.status]));

    return employees.map((e) => {
      const w = live.get(e.id);
      if (w) return { ...w, employee: e };
      return {
        employee: e,
        state: dayStatus.has(e.id) ? 'FINISHED' : 'NOT_STARTED',
        project: null,
        location: null,
        activity: null,
        breakType: null,
        since: null,
        sinceSeconds: 0,
        segmentSeconds: 0,
      };
    });
  }

  /** GET /management/dashboard: summary cards plus chart series over a range (spec §46). */
  async dashboard(user: AuthUser, range: DateRange) {
    const ids = await visibleEmployeeIds(user, 'dashboard.view');
    const r = { ...lastDays(30), ...range };
    const now = new Date();
    const todayDate = workDateFor(now);
    const empWhere = ids ? { employeeId: { in: ids } } : {};

    const [status, todaySegments, rangeSegments, activeProjects, missingClockOuts, pendingCorrections, projects] =
      await Promise.all([
        this.liveStatus(user),
        loadSegments({ workDay: { date: todayDate, ...empWhere } }),
        loadSegments({ workDay: { date: dateFilter(r), ...empWhere } }),
        prisma.project.count({
          where: {
            status: ProjectStatus.ACTIVE,
            ...(ids ? { members: { some: { employeeId: user.employeeId, isProjectLead: true, removedAt: null } } } : {}),
          },
        }),
        prisma.workDay.count({ where: { status: DayStatus.MISSING_CLOCK_OUT, ...empWhere } }),
        prisma.timeCorrectionRequest.count({ where: { status: CorrectionStatus.PENDING, ...empWhere } }),
        prisma.project.findMany({
          where: {
            status: ProjectStatus.ACTIVE,
            ...(ids ? { members: { some: { employeeId: user.employeeId, isProjectLead: true, removedAt: null } } } : {}),
          },
          select: { id: true, code: true, name: true, estimatedHours: true },
        }),
      ]);

    const sum = summarise(rangeSegments, now);
    const names = projectNames(rangeSegments);
    const employeeDept = new Map(
      (
        await prisma.employee.findMany({
          where: { id: { in: [...sum.byEmployee.keys()] } },
          select: { id: true, department: true, firstName: true, lastName: true },
        })
      ).map((e) => [e.id, e])
    );
    const byDepartment = new Map<string, number>();
    for (const [id, s] of sum.byEmployee) bump(byDepartment, employeeDept.get(id)?.department ?? 'Unknown', s);

    // Estimated vs actual uses all-time hours, not just the range.
    const allTime = await prisma.workSegment.findMany({
      where: { projectId: { in: projects.map((p) => p.id) } },
      include: segmentInclude,
    });
    const allTimeByProject = summarise(allTime, now).byProject;

    const count = (state: string) => status.filter((s) => s.state === state).length;
    return {
      range: r,
      cards: {
        employeesWorkingToday: count('WORKING'),
        employeesOnBreak: count('ON_BREAK'),
        employeesNotClockedIn: count('NOT_STARTED'),
        employeesFinished: count('FINISHED'),
        totalHoursToday: hours(summarise(todaySegments, now).total),
        activeProjects,
        missingClockOuts,
        pendingCorrections,
      },
      charts: {
        hoursByProject: [...sum.byProject.entries()]
          .map(([id, s]) => ({ ...names.get(id)!, hours: hours(s) }))
          .sort((a, b) => b.hours - a.hours),
        hoursByDepartment: toHoursList(byDepartment, 'department'),
        hoursByEmployee: [...sum.byEmployee.entries()]
          .map(([id, s]) => {
            const e = employeeDept.get(id);
            return { employeeId: id, name: e ? `${e.firstName} ${e.lastName}` : 'Unknown', hours: hours(s) };
          })
          .sort((a, b) => b.hours - a.hours),
        hoursOverTime: [...sum.byDay.entries()].sort().map(([date, s]) => ({ date, hours: hours(s) })),
        locationDistribution: toHoursList(sum.byLocation, 'location'),
        activityDistribution: toHoursList(sum.byActivity, 'activityType'),
        estimatedVsActual: projects.map((p) => ({
          projectId: p.id,
          code: p.code,
          name: p.name,
          estimatedHours: p.estimatedHours?.toNumber() ?? null,
          actualHours: hours(allTimeByProject.get(p.id) ?? 0),
        })),
      },
    };
  }

  /**
   * GET /management/estimate (spec §37). An estimate, not a guarantee:
   *   hours to do  = remaining estimated hours of the project
   *                  (or, with no estimate, the average total of completed projects)
   *   team per day = sum of each person's average daily hours over the last 90 days
   *                  (8h assumed, and flagged, for anyone without history)
   *   working days = hours to do / team per day
   * Cost (CEO only) splits the hours across the team by daily capacity, at current rates.
   */
  async estimate(user: AuthUser, projectId: string, employeeIds: string[]) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw AppError.notFound('Project not found');
    await assertProjectInScope(user, 'reports.view', projectId);
    // Labour cost needs compensation.view (spec §4).
    const isCeo = can(user, 'compensation.view');
    const now = new Date();

    const actual = summarise(await loadSegments({ projectId }), now).total / 3600;
    let basis: 'REMAINING_ESTIMATE' | 'HISTORICAL_AVERAGE';
    let hoursToDo: number;
    if (project.estimatedHours) {
      basis = 'REMAINING_ESTIMATE';
      hoursToDo = Math.max(0, project.estimatedHours.toNumber() - actual);
    } else {
      const done = await prisma.project.findMany({ where: { status: ProjectStatus.COMPLETED }, select: { id: true } });
      if (!done.length) {
        throw AppError.badRequest('Set estimated hours on the project: there are no completed projects to learn from yet');
      }
      const totals = summarise(await loadSegments({ projectId: { in: done.map((p) => p.id) } }), now).byProject;
      basis = 'HISTORICAL_AVERAGE';
      hoursToDo = [...totals.values()].reduce((a, b) => a + b, 0) / 3600 / done.length;
    }

    const window = lastDays(90);
    const team = await prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        compensations: isCeo ? { where: { effectiveTo: null }, take: 1 } : false,
      },
    });
    if (team.length !== employeeIds.length) throw AppError.badRequest('One or more employees were not found');

    const recent = await loadSegments({
      workDay: { employeeId: { in: employeeIds }, date: dateFilter(window), status: { in: VALID_DAY } },
    });
    const perEmployeeDay = new Map<string, Map<string, number>>();
    for (const s of recent) {
      const m = perEmployeeDay.get(s.workDay.employeeId) ?? new Map<string, number>();
      bump(m, iso(s.workDay.date), netSeconds(s, now));
      perEmployeeDay.set(s.workDay.employeeId, m);
    }

    const members = team.map((e) => {
      const daysWorked = [...(perEmployeeDay.get(e.id)?.values() ?? [])].filter((v) => v > 0);
      const assumed = daysWorked.length === 0;
      const dailyHours = assumed ? 8 : daysWorked.reduce((a, b) => a + b, 0) / daysWorked.length / 3600;
      return { e, dailyHours, assumed };
    });
    const teamDailyHours = members.reduce((a, m) => a + m.dailyHours, 0);
    const workingDays = teamDailyHours > 0 ? hoursToDo / teamDailyHours : null;
    const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

    const cost = isCeo
      ? members.reduce((sum, m) => {
          const share = teamDailyHours ? (hoursToDo * m.dailyHours) / teamDailyHours : 0;
          return sum + share * Number(m.e.compensations?.[0]?.baseHourlyRate ?? 0);
        }, 0)
      : undefined;

    return {
      project: { id: project.id, code: project.code, name: project.name, status: project.status },
      basis,
      actualHoursToDate: round(actual),
      estimatedHoursToDo: round(hoursToDo),
      team: members.map((m) => ({
        employeeId: m.e.id,
        name: `${m.e.firstName} ${m.e.lastName}`,
        averageDailyHours: round(m.dailyHours),
        assumedDefault: m.assumed,
      })),
      teamDailyHours: round(teamDailyHours),
      estimatedWorkingDays: workingDays === null ? null : round(workingDays, 1),
      ...(isCeo ? { estimatedLabourCost: round(cost ?? 0) } : {}),
      note: 'This is an estimate based on historical averages, not a guarantee.',
    };
  }
}

export const reportService = new ReportService();

/**
 * Helpers shared by the demo seed (seed.ts, wipes the database) and the additive sample data
 * (sample-data.ts). Nothing here deletes anything.
 */
import { ensureSystemRoles, systemRoleKey } from '../src/auth/permissions';
import { PrismaClient, Role, LocationType, ActivityType, BreakType, DayStatus, SegmentStatus, Prisma } from '@prisma/client';

export const H = 3600;

// Deterministic pseudo-random numbers so every reseed produces the same data.
let state = 42;
export const rand = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
export const jitter = (minutes: number) => Math.round((rand() * 2 - 1) * minutes);

/** Lagos (UTC+1, no DST) wall-clock time on a given date, as a UTC instant. */
export const lagos = (day: Date, hh: number, mm = 0) =>
  new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hh - 1, mm));
export const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
export const secs = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 1000);

/** The last `n` weekdays before today (Lagos), oldest first, as UTC-midnight dates. */
export const lastWorkingDays = (n: number) => {
  const todayLagos = new Date(Date.now() + H * 1000);
  const cursor = new Date(Date.UTC(todayLagos.getUTCFullYear(), todayLagos.getUTCMonth(), todayLagos.getUTCDate()));
  const days: Date[] = [];
  while (days.length < n) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) days.unshift(new Date(cursor));
  }
  return days;
};

export type Person = { first: string; last: string; email: string; code: string; dept: string; position: string; role: Role };

export async function createPerson(prisma: PrismaClient, p: Person, passwordHash: string, rates: { base: number; from: string; to?: string }[]) {
  await prisma.position.upsert({ where: { name: p.position }, create: { name: p.position }, update: {} });
  await ensureSystemRoles(prisma);
  const user = await prisma.user.create({
    data: {
      email: p.email,
      passwordHash,
      role: p.role,
      appRole: { connect: { key: systemRoleKey(p.role) } },
      mustChangePassword: false,
      employee: {
        create: {
          employeeCode: p.code,
          firstName: p.first,
          lastName: p.last,
          department: p.dept,
          position: p.position,
          hireDate: new Date(`${rates[0].from}T00:00:00Z`),
          compensations: {
            create: rates.map((r) => ({
              baseHourlyRate: new Prisma.Decimal(r.base),
              overtimeHourlyRate: new Prisma.Decimal(r.base * 1.5),
              currency: 'NGN',
              effectiveFrom: new Date(`${r.from}T00:00:00Z`),
              effectiveTo: r.to ? new Date(`${r.to}T00:00:00Z`) : null,
            })),
          },
        },
      },
    },
    include: { employee: true },
  });
  return user.employee!;
}

export type Block = { projectId: string; location: LocationType; activity: ActivityType; note: string; from: Date; to: Date };

/** Writes one completed day from consecutive blocks plus an optional lunch inside one block. */
export async function writeDay(prisma: PrismaClient, employeeId: string, date: Date, blocks: Block[], lunch?: { start: Date; end: Date }) {
  let presence = 0;
  let breakSecs = 0;
  const day = await prisma.workDay.create({ data: { employeeId, date, status: DayStatus.COMPLETED } });
  for (const b of blocks) {
    const duration = secs(b.from, b.to);
    presence += duration;
    const lunchHere = lunch && lunch.start >= b.from && lunch.end <= b.to;
    if (lunchHere) breakSecs += secs(lunch!.start, lunch!.end);
    await prisma.workSegment.create({
      data: {
        workDayId: day.id,
        projectId: b.projectId,
        location: b.location,
        status: SegmentStatus.COMPLETED,
        clockIn: b.from,
        clockOut: b.to,
        durationSeconds: duration,
        activities: {
          create: { projectId: b.projectId, activityType: b.activity, notes: b.note, startTime: b.from, endTime: b.to },
        },
        breaks: lunchHere
          ? { create: { breakType: BreakType.LUNCH, startTime: lunch!.start, endTime: lunch!.end, durationSeconds: secs(lunch!.start, lunch!.end) } }
          : undefined,
      },
    });
  }
  await prisma.workDay.update({ where: { id: day.id }, data: { totalWorkSeconds: presence, totalBreakSeconds: breakSecs } });
  return day;
}


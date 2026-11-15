/**
 * DEVELOPMENT SEED ONLY: fictional people, fictional projects, development-only passwords (spec §65, §66).
 * Wipes the database, then creates:
 *  - CEO, project manager and three employees (all password: Password123!)
 *  - PRJ-001 ABC Residence, PRJ-002 XYZ Mall, PRJ-003 Office Renovation
 *  - compensation history (John: ₦4,000 → ₦5,000 on 1 July)
 *  - the last 10 working days of realistic shifts, one forgotten clock-out and one pending correction
 */
import {
  PrismaClient,
  Role,
  ProjectStatus,
  LocationType,
  ActivityType,
  BreakType,
  DayStatus,
  SegmentStatus,
  CorrectionStatus,
  Prisma,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

import { H, jitter, lagos, addMin, lastWorkingDays, createPerson as createPersonWith, writeDay as writeDayWith, type Person, type Block } from './seed-helpers';

const prisma = new PrismaClient();
const createPerson = (p: Person, hash: string, rates: { base: number; from: string; to?: string }[]) => createPersonWith(prisma, p, hash, rates);
const writeDay = (employeeId: string, date: Date, blocks: Block[], lunch?: { start: Date; end: Date }) => writeDayWith(prisma, employeeId, date, blocks, lunch);
const DEV_PASSWORD = 'Password123!';
async function wipe() {
  // AuditLog is append-only (trigger), so it is truncated rather than deleted.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog", "Notification"');
  await prisma.payrollRecord.deleteMany();
  await prisma.timeCorrectionRequest.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.break.deleteMany();
  await prisma.activityHeartbeat.deleteMany();
  await prisma.workSegment.deleteMany();
  await prisma.workDay.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.employeeDevice.deleteMany();
  await prisma.compensation.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
}

async function main() {
  // This seed wipes every table. Never let it touch a live database.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the demo seed with NODE_ENV=production: it deletes all data. Use `node dist/scripts/create-admin.js` to create the first CEO.');
  }
  console.log('🌱 Seeding development data...');
  await wipe();

  for (const name of ['Executive', 'Architecture', 'Engineering', 'Site Operations']) {
    await prisma.department.create({ data: { name } });
  }

  const hash = await bcrypt.hash(DEV_PASSWORD, 10);
  const ceo = await createPerson(
    { first: 'Ada', last: 'Okafor', email: 'ceo@example.com', code: 'CCP-001', dept: 'Executive', position: 'Chief Executive Officer', role: Role.CEO_ADMIN },
    hash,
    [{ base: 15000, from: '2020-01-15' }]
  );
  const pm = await createPerson(
    { first: 'Tunde', last: 'Bello', email: 'manager@example.com', code: 'CCP-002', dept: 'Architecture', position: 'Project Manager', role: Role.PROJECT_MANAGER },
    hash,
    [{ base: 8000, from: '2021-03-01' }]
  );
  const john = await createPerson(
    { first: 'John', last: 'Doe', email: 'john@example.com', code: 'CCP-010', dept: 'Architecture', position: 'Architect', role: Role.EMPLOYEE },
    hash,
    [
      { base: 4000, from: '2024-01-01', to: '2026-06-30' },
      { base: 5000, from: '2026-07-01' },
    ]
  );
  const mary = await createPerson(
    { first: 'Mary', last: 'Johnson', email: 'mary@example.com', code: 'CCP-011', dept: 'Engineering', position: 'Structural Engineer', role: Role.EMPLOYEE },
    hash,
    [{ base: 4000, from: '2023-05-02' }]
  );
  const peter = await createPerson(
    { first: 'Peter', last: 'Adeyemi', email: 'peter@example.com', code: 'CCP-012', dept: 'Site Operations', position: 'Site Supervisor', role: Role.EMPLOYEE },
    hash,
    [{ base: 3500, from: '2025-02-10' }]
  );

  const project = (code: string, name: string, client: string, location: string, estimatedHours: number, start: string) =>
    prisma.project.create({
      data: {
        code,
        name,
        clientName: client,
        location,
        estimatedHours,
        status: ProjectStatus.ACTIVE,
        startDate: new Date(`${start}T00:00:00Z`),
        createdById: ceo.userId,
      },
    });
  const abc = await project('PRJ-001', 'ABC Residence', 'ABC Holdings', 'Lekki, Lagos', 340, '2026-09-01');
  const xyz = await project('PRJ-002', 'XYZ Mall', 'XYZ Retail Ltd', 'Ikeja, Lagos', 1200, '2026-08-15');
  const reno = await project('PRJ-003', 'Office Renovation', 'CCP (internal)', 'Head office', 120, '2026-10-01');

  await prisma.projectMember.createMany({
    data: [
      { projectId: abc.id, employeeId: pm.id, isProjectLead: true },
      { projectId: xyz.id, employeeId: pm.id, isProjectLead: true },
      { projectId: reno.id, employeeId: pm.id, isProjectLead: true },
      { projectId: abc.id, employeeId: john.id },
      { projectId: xyz.id, employeeId: john.id },
      { projectId: abc.id, employeeId: mary.id },
      { projectId: reno.id, employeeId: mary.id },
      { projectId: xyz.id, employeeId: peter.id },
      { projectId: abc.id, employeeId: peter.id },
    ],
  });

  const days = lastWorkingDays(10);
  for (const [i, date] of days.entries()) {
    // John: the spec's §31 example day shape, with small variations.
    {
      const start = addMin(lagos(date, 8), jitter(10));
      const site = addMin(lagos(date, 11), jitter(15));
      const lunch = { start: addMin(lagos(date, 13), jitter(10)), end: addMin(lagos(date, 14), jitter(10)) };
      const end = addMin(lagos(date, 17), jitter(20));
      if (i === days.length - 2) {
        // Forgotten clock-out: started, never ended; flagged by the missing clock-out job.
        const day = await prisma.workDay.create({ data: { employeeId: john.id, date, status: DayStatus.MISSING_CLOCK_OUT } });
        await prisma.workSegment.create({
          data: {
            workDayId: day.id,
            projectId: abc.id,
            location: LocationType.OFFICE,
            status: SegmentStatus.AUTO_CLOSED,
            clockIn: start,
            activities: { create: { projectId: abc.id, activityType: ActivityType.DESIGN, notes: 'Floor plans', startTime: start } },
          },
        });
      } else {
        await writeDay(
          john.id,
          date,
          [
            { projectId: abc.id, location: LocationType.OFFICE, activity: ActivityType.DESIGN, note: 'Floor plans', from: start, to: site },
            { projectId: abc.id, location: LocationType.SITE, activity: ActivityType.SITE_INSPECTION, note: 'Foundation inspection', from: site, to: lunch.end },
            { projectId: xyz.id, location: LocationType.OFFICE, activity: ActivityType.DOCUMENTATION, note: 'Tender documents', from: lunch.end, to: end },
          ],
          lunch
        );
      }
    }

    // Mary: office drawings with a client meeting most days.
    {
      const start = addMin(lagos(date, 8, 30), jitter(15));
      const meeting = addMin(lagos(date, 10, 30), jitter(10));
      const switchAt = addMin(lagos(date, 12), jitter(10));
      const lunch = { start: addMin(lagos(date, 13), jitter(5)), end: addMin(lagos(date, 13, 45), jitter(5)) };
      const end = addMin(lagos(date, 17, 30), jitter(20));
      const day = await writeDay(
        mary.id,
        date,
        [
          { projectId: abc.id, location: LocationType.OFFICE, activity: ActivityType.DRAWING, note: 'Structural drawings', from: start, to: meeting },
          { projectId: abc.id, location: LocationType.OFFICE, activity: ActivityType.CLIENT_MEETING, note: 'Client review', from: meeting, to: switchAt },
          { projectId: reno.id, location: i % 3 === 0 ? LocationType.REMOTE : LocationType.OFFICE, activity: ActivityType.DESIGN, note: 'Layout options', from: switchAt, to: end },
        ],
        lunch
      );
      if (i === days.length - 3) {
        // Pending correction: Mary says she actually stayed 45 minutes later.
        const last = await prisma.workSegment.findFirstOrThrow({ where: { workDayId: day.id }, orderBy: { clockIn: 'desc' } });
        await prisma.timeCorrectionRequest.create({
          data: {
            workDayId: day.id,
            employeeId: mary.id,
            reason: 'Stayed late to finish the layout; clocked out too early by mistake.',
            requestedChanges: {
              segmentId: last.id,
              proposedClockIn: last.clockIn.toISOString(),
              proposedClockOut: addMin(last.clockOut!, 45).toISOString(),
            },
            status: CorrectionStatus.PENDING,
          },
        });
        await prisma.workDay.update({ where: { id: day.id }, data: { status: DayStatus.CORRECTION_PENDING } });
      }
    }

    // Peter: mostly on site at XYZ Mall.
    {
      const start = addMin(lagos(date, 7, 30), jitter(15));
      const lunch = { start: addMin(lagos(date, 12, 30), jitter(10)), end: addMin(lagos(date, 13, 15), jitter(10)) };
      const back = addMin(lagos(date, 15), jitter(15));
      const end = addMin(lagos(date, 16, 30), jitter(20));
      await writeDay(
        peter.id,
        date,
        [
          { projectId: xyz.id, location: LocationType.SITE, activity: ActivityType.SITE_INSPECTION, note: 'Supervising block work', from: start, to: back },
          { projectId: abc.id, location: i % 2 ? LocationType.SITE : LocationType.OTHER, activity: ActivityType.ADMINISTRATION, note: 'Materials log', from: back, to: end },
        ],
        lunch
      );
    }
  }

  console.log('✅ Seed complete (development credentials, never use in production):');
  for (const email of ['ceo@example.com', 'manager@example.com', 'john@example.com', 'mary@example.com', 'peter@example.com']) {
    console.log(`   ${email.padEnd(22)} ${DEV_PASSWORD}`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

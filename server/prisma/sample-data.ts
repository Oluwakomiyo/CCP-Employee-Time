/**
 * ADDITIVE sample data for a live CCP Time database: realistic staff, projects and about seven weeks
 * of recorded time, attached to the existing CEO account. Unlike seed.ts it deletes NOTHING.
 *
 *   cd server
 *   DATABASE_URL="<database url>" npx tsx prisma/sample-data.ts
 *
 * - Refuses to run without a CEO account (create one with create-admin first).
 * - Refuses to run twice (it checks for its own project codes).
 * - Sample people share one random password, written to SAMPLE_ACCOUNTS_FILE
 *   (default ../sample-accounts.txt, git-ignored), never printed. Emails use example.com,
 *   which can't receive mail, so the sample people are obvious and harmless.
 */
import { PrismaClient, Role, ProjectStatus, LocationType, ActivityType, DayStatus, SegmentStatus, CorrectionStatus, AuditAction, NotificationType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateTemporaryPassword } from '../src/utils/password';
import { addMin, jitter, lagos, lastWorkingDays, rand, createPerson, writeDay, type Block } from './seed-helpers';

const prisma = new PrismaClient();
const { OFFICE, SITE, REMOTE } = LocationType;
const { DESIGN, DRAWING, CLIENT_MEETING, SITE_INSPECTION, DOCUMENTATION, ADMINISTRATION } = ActivityType;

/** One part of a day: what, where, for how many minutes. */
type Part = { project: string; location: LocationType; activity: ActivityType; note: string; minutes: number };

/** Builds consecutive blocks from a start time, with a 45 to 60 minute lunch inside whichever block covers 1 pm. */
function planDay(date: Date, startHour: number, parts: Part[], projectIds: Record<string, string>) {
  // startHour may be fractional (8.5 = 8:30).
  let at = addMin(lagos(date, Math.floor(startHour), Math.round((startHour % 1) * 60)), jitter(15));
  const blocks: Block[] = [];
  for (const p of parts) {
    const to = addMin(at, p.minutes + jitter(10));
    blocks.push({ projectId: projectIds[p.project], location: p.location, activity: p.activity, note: p.note, from: at, to });
    at = to;
  }
  const lunchStart = addMin(lagos(date, 13), jitter(15));
  const lunchEnd = addMin(lunchStart, 45 + Math.round(rand() * 15));
  const covering = blocks.find((b) => b.from <= lunchStart && b.to >= lunchEnd);
  if (covering) {
    // Lunch is unpaid: stretch the covering block so the day still has its working minutes.
    const extra = lunchEnd.getTime() - lunchStart.getTime();
    const i = blocks.indexOf(covering);
    for (let j = i; j < blocks.length; j++) {
      if (j > i) blocks[j].from = new Date(blocks[j].from.getTime() + extra);
      blocks[j].to = new Date(blocks[j].to.getTime() + extra);
    }
  }
  return { blocks, lunch: covering ? { start: lunchStart, end: lunchEnd } : undefined };
}

const SAMPLE_CODES = ['PRJ-101', 'PRJ-102', 'PRJ-103', 'PRJ-104', 'PRJ-105'];

async function main() {
  const ceo = await prisma.employee.findFirst({ where: { user: { appRole: { key: 'ceo_admin' } } }, orderBy: { createdAt: 'asc' } });
  if (!ceo) throw new Error('No CEO account yet. Run create-admin first.');
  if (await prisma.project.count({ where: { code: { in: SAMPLE_CODES } } })) {
    throw new Error('Sample data is already loaded (projects PRJ-101 to PRJ-105 exist). Nothing was changed.');
  }

  for (const name of ['Architecture', 'Engineering', 'Interior Design', 'Site Operations']) {
    await prisma.department.upsert({ where: { name }, create: { name }, update: {} });
  }

  const password = generateTemporaryPassword() + generateTemporaryPassword();
  const hash = await bcrypt.hash(password, 12);
  const person = (first: string, last: string, code: string, dept: string, position: string, rates: { base: number; from: string; to?: string }[], role: Role = Role.EMPLOYEE) =>
    createPerson(prisma, { first, last, email: `${first}.${last}@example.com`.toLowerCase(), code, dept, position, role }, hash, rates);

  const tunde = await person('Tunde', 'Bello', 'CCP-101', 'Architecture', 'Project Manager', [{ base: 8000, from: '2021-03-01' }], Role.PROJECT_MANAGER);
  const funke = await person('Funke', 'Adebayo', 'CCP-102', 'Architecture', 'Senior Architect', [
    { base: 5500, from: '2022-06-01', to: '2026-09-30' },
    { base: 6500, from: '2026-10-01' },
  ]);
  const chinedu = await person('Chinedu', 'Okeke', 'CCP-103', 'Architecture', 'Architect', [{ base: 5000, from: '2023-02-13' }]);
  const aisha = await person('Aisha', 'Musa', 'CCP-104', 'Engineering', 'Structural Engineer', [{ base: 5000, from: '2023-08-01' }]);
  const emeka = await person('Emeka', 'Nwosu', 'CCP-105', 'Engineering', 'Services Engineer (MEP)', [{ base: 4500, from: '2024-04-15' }]);
  const kemi = await person('Kemi', 'Alade', 'CCP-106', 'Interior Design', 'Interior Designer', [{ base: 4500, from: '2024-09-02' }]);
  const ibrahim = await person('Ibrahim', 'Yusuf', 'CCP-107', 'Site Operations', 'Site Supervisor', [{ base: 3500, from: '2025-01-06' }]);
  const bola = await person('Bola', 'Ajayi', 'CCP-108', 'Site Operations', 'Site Engineer', [{ base: 4000, from: '2025-05-19' }]);

  const days = lastWorkingDays(35); // about seven weeks, oldest first
  const history = days.slice(0, 15); // the completed project's last weeks
  const recent = days.slice(15); // the last four weeks
  const day0 = (d: Date) => d.toISOString().slice(0, 10);

  const project = (code: string, name: string, clientName: string, location: string, estimatedHours: number, status: ProjectStatus, start: string, end?: string) =>
    prisma.project.create({
      data: {
        code,
        name,
        clientName,
        location,
        estimatedHours,
        status,
        startDate: new Date(`${start}T00:00:00Z`),
        endDate: end ? new Date(`${end}T00:00:00Z`) : null,
        createdById: ceo.userId,
      },
    });
  const lekki = await project('PRJ-101', 'Lekki Waterfront Residence', 'Adeleke Family', 'Lekki Phase 1, Lagos', 420, ProjectStatus.ACTIVE, '2026-08-03');
  const ikeja = await project('PRJ-102', 'Ikeja City Mall Extension', 'Ikeja Retail Ltd', 'Ikeja, Lagos', 1500, ProjectStatus.ACTIVE, '2026-07-13');
  const abuja = await project('PRJ-103', 'Abuja Corporate HQ Fit-out', 'Sterling Partners', 'Central Business District, Abuja', 600, ProjectStatus.ACTIVE, '2026-09-14');
  await project('PRJ-104', 'Victoria Island Office Tower Concept', 'Coastline Developments', 'Victoria Island, Lagos', 260, ProjectStatus.PLANNED, '2026-12-01');
  const yaba = await project('PRJ-105', 'Yaba Tech Hub Renovation', 'Yaba Innovation Trust', 'Yaba, Lagos', 300, ProjectStatus.COMPLETED, '2026-06-01', day0(history[history.length - 1]));
  const ids = { lekki: lekki.id, ikeja: ikeja.id, abuja: abuja.id, yaba: yaba.id };

  const team: [string, string, boolean][] = [
    [lekki.id, tunde.id, true], [lekki.id, funke.id, false], [lekki.id, chinedu.id, false], [lekki.id, aisha.id, false], [lekki.id, ibrahim.id, false],
    [ikeja.id, tunde.id, true], [ikeja.id, chinedu.id, false], [ikeja.id, aisha.id, false], [ikeja.id, emeka.id, false], [ikeja.id, bola.id, false], [ikeja.id, ibrahim.id, false],
    [abuja.id, tunde.id, true], [abuja.id, funke.id, false], [abuja.id, kemi.id, false], [abuja.id, emeka.id, false],
    [yaba.id, tunde.id, true], [yaba.id, kemi.id, false], [yaba.id, chinedu.id, false], [yaba.id, bola.id, false],
  ];
  // The completed project's people were taken off it when it closed; their hours stay.
  const closed = new Date(`${day0(history[history.length - 1])}T18:00:00Z`);
  await prisma.projectMember.createMany({
    data: team.map(([projectId, employeeId, isProjectLead]) => ({ projectId, employeeId, isProjectLead, removedAt: projectId === yaba.id ? closed : null })),
  });
  // Funke also sits on the planned tower project (no time yet).
  const tower = await prisma.project.findUniqueOrThrow({ where: { code: 'PRJ-104' } });
  await prisma.projectMember.create({ data: { projectId: tower.id, employeeId: funke.id } });

  /** Each person's typical day; `i` varies it so no two days look the same. */
  const routines: { who: typeof funke; start: number; parts: (i: number) => Part[] }[] = [
    { who: tunde, start: 8, parts: (i) => [
      { project: 'lekki', location: OFFICE, activity: ADMINISTRATION, note: 'Programme review', minutes: 90 },
      { project: i % 2 ? 'ikeja' : 'abuja', location: i % 4 === 0 ? SITE : OFFICE, activity: CLIENT_MEETING, note: i % 4 === 0 ? 'Site progress meeting' : 'Client progress meeting', minutes: 120 },
      { project: 'ikeja', location: OFFICE, activity: DOCUMENTATION, note: 'Cost and variation reports', minutes: 240 },
    ] },
    { who: funke, start: 8, parts: (i) => [
      { project: 'lekki', location: OFFICE, activity: DESIGN, note: 'Facade and elevations', minutes: 210 },
      { project: i % 3 === 0 ? 'lekki' : 'abuja', location: i % 5 === 0 ? REMOTE : OFFICE, activity: i % 3 === 0 ? CLIENT_MEETING : DESIGN, note: i % 3 === 0 ? 'Design review with the Adelekes' : 'Reception and boardroom layout', minutes: 240 },
    ] },
    { who: chinedu, start: 8.5, parts: (i) => [
      { project: 'ikeja', location: OFFICE, activity: DRAWING, note: 'Construction drawings, level 2', minutes: 240 },
      { project: i % 2 ? 'lekki' : 'ikeja', location: OFFICE, activity: i % 2 ? DRAWING : DOCUMENTATION, note: i % 2 ? 'Roof plan details' : 'Door and window schedules', minutes: 210 },
    ] },
    { who: aisha, start: 8, parts: (i) => [
      { project: 'ikeja', location: OFFICE, activity: DESIGN, note: 'Transfer beam calculations', minutes: 180 },
      { project: i % 3 === 0 ? 'ikeja' : 'lekki', location: i % 3 === 0 ? SITE : OFFICE, activity: i % 3 === 0 ? SITE_INSPECTION : DESIGN, note: i % 3 === 0 ? 'Rebar inspection before the pour' : 'Pile cap and slab design', minutes: 270 },
    ] },
    { who: emeka, start: 8.5, parts: (i) => [
      { project: 'ikeja', location: OFFICE, activity: DESIGN, note: 'HVAC duct routing', minutes: 210 },
      { project: i % 2 ? 'abuja' : 'ikeja', location: OFFICE, activity: i % 2 ? DESIGN : DOCUMENTATION, note: i % 2 ? 'Electrical layout for the fit-out' : 'MEP specifications', minutes: 240 },
    ] },
    { who: kemi, start: 9, parts: (i) => [
      { project: 'abuja', location: i % 4 === 0 ? REMOTE : OFFICE, activity: DESIGN, note: 'Finishes and furniture schedule', minutes: 240 },
      { project: 'abuja', location: OFFICE, activity: i % 3 === 0 ? CLIENT_MEETING : DRAWING, note: i % 3 === 0 ? 'Material samples with Sterling' : 'Joinery details', minutes: 180 },
    ] },
    { who: ibrahim, start: 7.5, parts: (i) => [
      { project: 'ikeja', location: SITE, activity: SITE_INSPECTION, note: 'Supervising block work and concrete pour', minutes: 330 + (i % 4 === 0 ? 120 : 0) },
      { project: 'lekki', location: SITE, activity: ADMINISTRATION, note: 'Materials delivery log', minutes: 150 },
    ] },
    { who: bola, start: 7.5, parts: (i) => [
      { project: 'ikeja', location: SITE, activity: SITE_INSPECTION, note: 'Setting out and levels', minutes: 270 },
      { project: 'ikeja', location: i % 2 ? SITE : OFFICE, activity: i % 2 ? SITE_INSPECTION : DOCUMENTATION, note: i % 2 ? 'Quality checks on formwork' : 'Daily site report', minutes: 210 },
    ] },
  ];

  // The completed Yaba project: its last three weeks of work.
  for (const [i, date] of history.entries()) {
    for (const [who, start, note, location] of [
      [kemi, 9, 'Workspace fit-out details', OFFICE],
      [chinedu, 8.5, 'As-built drawings', OFFICE],
      [bola, 7.5, 'Snagging and handover checks', SITE],
    ] as const) {
      if (rand() < 0.08) continue; // a day off now and then
      const { blocks, lunch } = planDay(date, start, [
        { project: 'yaba', location, activity: location === SITE ? SITE_INSPECTION : DRAWING, note, minutes: 240 },
        { project: 'yaba', location: OFFICE, activity: i % 4 === 0 ? CLIENT_MEETING : DOCUMENTATION, note: i % 4 === 0 ? 'Handover meeting with the Trust' : 'Close-out documents', minutes: 210 },
      ], ids);
      await writeDay(prisma, who.id, date, blocks, lunch);
    }
  }

  // The last four weeks on the live projects, with one forgotten clock-out and one correction waiting.
  let pendingDayId: string | null = null;
  for (const [i, date] of recent.entries()) {
    for (const r of routines) {
      if (rand() < 0.06) continue;
      const { blocks, lunch } = planDay(date, r.start, r.parts(i), ids);
      if (r.who.id === chinedu.id && i === recent.length - 2) {
        const day = await prisma.workDay.create({ data: { employeeId: chinedu.id, date, status: DayStatus.MISSING_CLOCK_OUT } });
        const first = blocks[0];
        await prisma.workSegment.create({
          data: {
            workDayId: day.id,
            projectId: first.projectId,
            location: first.location,
            status: SegmentStatus.AUTO_CLOSED,
            clockIn: first.from,
            activities: { create: { projectId: first.projectId, activityType: first.activity, notes: first.note, startTime: first.from } },
          },
        });
        await prisma.notification.create({
          data: {
            userId: chinedu.userId,
            type: NotificationType.MISSING_CLOCK_OUT,
            title: `You did not clock out on ${day0(date)}`,
            body: 'Submit a correction with the time you actually finished.',
            data: { workDayId: day.id },
          },
        });
        continue;
      }
      const day = await writeDay(prisma, r.who.id, date, blocks, lunch);
      if (r.who.id === aisha.id && i === recent.length - 3) pendingDayId = day.id;
    }
  }

  if (pendingDayId) {
    const last = await prisma.workSegment.findFirstOrThrow({ where: { workDayId: pendingDayId }, orderBy: { clockIn: 'desc' } });
    const day = await prisma.workDay.update({ where: { id: pendingDayId }, data: { status: DayStatus.CORRECTION_PENDING } });
    const correction = await prisma.timeCorrectionRequest.create({
      data: {
        workDayId: pendingDayId,
        employeeId: aisha.id,
        reason: 'Stayed on site for the slab pour until it finished; clocked out before leaving the office.',
        requestedChanges: { segmentId: last.id, proposedClockIn: last.clockIn.toISOString(), proposedClockOut: addMin(last.clockOut!, 60).toISOString() },
        status: CorrectionStatus.PENDING,
      },
    });
    const reviewers = await prisma.user.findMany({ where: { OR: [{ appRole: { key: 'ceo_admin' } }, { id: tunde.userId }] }, select: { id: true } });
    await prisma.notification.createMany({
      data: reviewers.map((u) => ({
        userId: u.id,
        type: NotificationType.CORRECTION_SUBMITTED,
        title: 'A time correction is waiting for review',
        body: `Workday ${day0(day.date)}: Aisha Musa asked to add an hour for the slab pour.`,
        data: { correctionId: correction.id, workDayId: pendingDayId },
      })),
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: AuditAction.CREATE,
      entityName: 'SampleData',
      entityId: 'PRJ-101..PRJ-105',
      afterState: { event: 'SAMPLE_DATA_LOADED', people: 8, projects: SAMPLE_CODES, workingDays: days.length },
    },
  });

  const file = resolve(process.env.SAMPLE_ACCOUNTS_FILE ?? '../sample-accounts.txt');
  const emails = [tunde, funke, chinedu, aisha, emeka, kemi, ibrahim, bola].map((e) => `${e.firstName.toLowerCase()}.${e.lastName.toLowerCase()}@example.com`);
  writeFileSync(file, `CCP Time sample accounts (all share this password; keep this file private)\nPassword: ${password}\n\n${emails.join('\n')}\n`, { mode: 0o600 });
  console.log(`Sample data loaded: 8 people, 5 projects, ${days.length} working days. Logins saved to ${file}`);
}

main()
  .catch((e) => {
    console.error(`Sample data not loaded: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

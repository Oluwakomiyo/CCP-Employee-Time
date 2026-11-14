import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role, DayStatus, SegmentStatus, AuditAction } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { staleSessionService } from '../src/modules/time/stale-session.service';
import { app, auth, createProject, createUser, login, resetDb } from './helpers';

/** Sets the server clock. Times below are UTC; Lagos is UTC+1. */
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const H = 3600;

let pm: Awaited<ReturnType<typeof createUser>>;
let tPm: string;
let projA: { id: string };
let projB: { id: string };
let projUnassigned: { id: string };

/** A fresh employee on projects A and B, so each test owns its own records. */
const newEmployee = async () => {
  const u = await createUser(Role.EMPLOYEE);
  await prisma.projectMember.createMany({
    data: [
      { projectId: projA.id, employeeId: u.employeeId },
      { projectId: projB.id, employeeId: u.employeeId },
    ],
  });
  const token = await login(u.email);
  const post = (path: string, body: object = {}) => request(app).post(`/api/v1/time${path}`).set(auth(token)).send(body);
  return { ...u, token, post };
};

const daysOf = (employeeId: string) =>
  prisma.workDay.findMany({
    where: { employeeId },
    include: { segments: { orderBy: { clockIn: 'asc' }, include: { breaks: true, activities: true } } },
  });

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at('2026-11-01T09:00:00Z');
  await resetDb();
  pm = await createUser(Role.PROJECT_MANAGER);
  const other = await createUser(Role.EMPLOYEE);
  projA = await createProject('ABC', [{ employeeId: pm.employeeId, lead: true }]);
  projB = await createProject('XYZ', [{ employeeId: pm.employeeId, lead: true }]);
  projUnassigned = await createProject('ZZZ', [{ employeeId: other.employeeId }]);
  tPm = await login(pm.email);
});

afterAll(() => vi.useRealTimers());
beforeEach(() => at('2026-11-10T07:00:00Z')); // 08:00 Lagos

describe('spec §62 critical time-tracking cases', () => {
  it('case 1: start -> end gives one workday, one segment, correct duration', async () => {
    const e = await newEmployee();
    expect((await e.post('/start', { projectId: projA.id, locationType: 'OFFICE', activityType: 'DESIGN' })).status).toBe(201);
    at('2026-11-10T10:00:00Z');
    const end = await e.post('/end');
    expect(end.status).toBe(200);
    expect(end.body.data.state).toBe('NOT_WORKING');

    const days = await daysOf(e.employeeId);
    expect(days).toHaveLength(1);
    expect(days[0].date.toISOString().slice(0, 10)).toBe('2026-11-10');
    expect(days[0].status).toBe(DayStatus.COMPLETED);
    expect(days[0].segments).toHaveLength(1);
    expect(days[0].segments[0].durationSeconds).toBe(3 * H);
    expect(days[0].totalWorkSeconds).toBe(3 * H);
  });

  it('case 2: start -> change project -> end gives two segments with no overlap', async () => {
    const e = await newEmployee();
    await e.post('/start', { projectId: projA.id, locationType: 'OFFICE' });
    at('2026-11-10T10:00:00Z');
    expect((await e.post('/project', { projectId: projB.id })).status).toBe(200);
    at('2026-11-10T16:00:00Z');
    await e.post('/end');

    const [day] = await daysOf(e.employeeId);
    const [s1, s2] = day.segments;
    expect(day.segments).toHaveLength(2);
    expect(s1.projectId).toBe(projA.id);
    expect(s2.projectId).toBe(projB.id);
    expect(s1.clockOut!.getTime()).toBe(s2.clockIn.getTime());
    expect([s1.durationSeconds, s2.durationSeconds]).toEqual([3 * H, 6 * H]);
  });

  it('case 3: a recorded break is excluded from working time', async () => {
    const e = await newEmployee();
    await e.post('/start', { projectId: projA.id });
    at('2026-11-10T12:00:00Z');
    await e.post('/breaks/start', { breakType: 'LUNCH' });
    at('2026-11-10T13:00:00Z');
    await e.post('/breaks/end');
    at('2026-11-10T16:00:00Z');
    await e.post('/end');

    const [day] = await daysOf(e.employeeId);
    expect(day.totalWorkSeconds).toBe(9 * H);
    expect(day.totalBreakSeconds).toBe(1 * H);
    expect(day.totalWorkSeconds - day.totalBreakSeconds).toBe(8 * H);
  });

  it('case 4: a break cannot move to another project', async () => {
    const e = await newEmployee();
    await e.post('/start', { projectId: projA.id });
    at('2026-11-10T08:00:00Z');
    await e.post('/breaks/start', {});
    const blocked = await e.post('/project', { projectId: projB.id });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ON_BREAK');
    at('2026-11-10T08:30:00Z');
    await e.post('/breaks/end');
    await e.post('/project', { projectId: projB.id });
    at('2026-11-10T10:00:00Z');
    await e.post('/end');

    const [day] = await daysOf(e.employeeId);
    expect(day.segments[0].projectId).toBe(projA.id);
    expect(day.segments[0].breaks).toHaveLength(1);
    expect(day.segments[1].breaks).toHaveLength(0);
  });

  it('case 5: double-clicking Start Work creates only one workday', async () => {
    const e = await newEmployee();
    const results = await Promise.all([
      e.post('/start', { projectId: projA.id }),
      e.post('/start', { projectId: projA.id }),
      e.post('/start', { projectId: projA.id }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    const days = await daysOf(e.employeeId);
    expect(days).toHaveLength(1);
    expect(days[0].segments).toHaveLength(1);
  });

  it('double break start and double end are rejected too', async () => {
    const e = await newEmployee();
    await e.post('/start', { projectId: projA.id });
    const breaks = await Promise.all([e.post('/breaks/start', {}), e.post('/breaks/start', {})]);
    expect(breaks.map((r) => r.status).sort()).toEqual([201, 409]);
    await e.post('/breaks/end');
    const ends = await Promise.all([e.post('/end'), e.post('/end')]);
    expect(ends.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('case 6: an unassigned project is rejected', async () => {
    const e = await newEmployee();
    const res = await e.post('/start', { projectId: projUnassigned.id });
    expect(res.status).toBe(403);
    expect(await daysOf(e.employeeId)).toHaveLength(0);
  });

  it("case 7: an employee cannot read another employee's time", async () => {
    const e1 = await newEmployee();
    const e2 = await newEmployee();
    await e2.post('/start', { projectId: projA.id });
    const res = await request(app)
      .get(`/api/v1/me/time?all=true&employeeId=${e2.employeeId}`)
      .set(auth(e1.token));
    expect(res.status).toBe(200);
    expect(res.body.data.history.every((d: { employeeId: string }) => d.employeeId === e1.employeeId)).toBe(true);
  });

  it('case 8: forgotten clock-out is flagged, never guessed, and the job is idempotent', async () => {
    const e = await newEmployee();
    await e.post('/start', { projectId: projA.id });
    at('2026-11-11T02:00:00Z'); // 19h later

    // Other tests leave employees clocked in too, so check this employee's segment specifically.
    const [mine] = (await daysOf(e.employeeId))[0].segments;
    expect((await staleSessionService.flagMissingClockOuts(16)).segmentIds).toContain(mine.id);
    expect((await staleSessionService.flagMissingClockOuts(16)).flaggedCount).toBe(0);

    const [day] = await daysOf(e.employeeId);
    expect(day.status).toBe(DayStatus.MISSING_CLOCK_OUT);
    expect(day.segments[0].status).toBe(SegmentStatus.AUTO_CLOSED);
    expect(day.segments[0].clockOut).toBeNull();
    expect(day.segments[0].durationSeconds).toBeNull();
    expect(day.totalWorkSeconds).toBe(0);

    // The employee is free to start the next day.
    at('2026-11-11T07:00:00Z');
    expect((await e.post('/start', { projectId: projA.id })).status).toBe(201);
  });

  it('case 9: an approved correction updates the record and is audited', async () => {
    const e = await newEmployee();
    await e.post('/start', { projectId: projA.id });
    at('2026-11-10T09:00:00Z');
    await e.post('/breaks/start', { breakType: 'LUNCH' }); // left open by the forgotten clock-out
    at('2026-11-11T02:00:00Z');
    await staleSessionService.flagMissingClockOuts(16);
    const [flagged] = await daysOf(e.employeeId);

    const submit = await request(app)
      .post('/api/v1/corrections')
      .set(auth(e.token))
      .send({
        workDayId: flagged.id,
        reason: 'I forgot to clock out.',
        requestedChanges: {
          segmentId: flagged.segments[0].id,
          proposedClockIn: '2026-11-10T07:00:00Z',
          proposedClockOut: '2026-11-10T16:15:00Z',
        },
      });
    expect(submit.status).toBe(201);

    const review = await request(app)
      .patch(`/api/v1/corrections/${submit.body.data.correction?.id ?? submit.body.data.id}/review`)
      .set(auth(tPm))
      .send({ status: 'APPROVED', reviewNotes: 'Confirmed with site log' });
    expect(review.status).toBe(200);

    const [day] = await daysOf(e.employeeId);
    expect(day.status).toBe(DayStatus.CORRECTED);
    expect(day.segments[0].status).toBe(SegmentStatus.COMPLETED);
    expect(day.segments[0].durationSeconds).toBe(9.25 * H);
    expect(day.segments[0].breaks[0].endTime!.toISOString()).toBe('2026-11-10T16:15:00.000Z');
    expect(day.totalWorkSeconds).toBe(9.25 * H);
    const log = await prisma.auditLog.findFirst({ where: { action: AuditAction.APPROVE_CORRECTION } });
    expect(log).not.toBeNull();
  });

  it('case 10: a rejected correction leaves the record unchanged and stores the comment', async () => {
    const e = await newEmployee();
    await e.post('/start', { projectId: projA.id });
    at('2026-11-11T02:00:00Z');
    await staleSessionService.flagMissingClockOuts(16);
    const [flagged] = await daysOf(e.employeeId);

    const submit = await request(app)
      .post('/api/v1/corrections')
      .set(auth(e.token))
      .send({
        workDayId: flagged.id,
        reason: 'I forgot to clock out.',
        requestedChanges: {
          segmentId: flagged.segments[0].id,
          proposedClockIn: '2026-11-10T07:00:00Z',
          proposedClockOut: '2026-11-10T23:00:00Z',
        },
      });
    const id = submit.body.data.correction?.id ?? submit.body.data.id;
    const review = await request(app)
      .patch(`/api/v1/corrections/${id}/review`)
      .set(auth(tPm))
      .send({ status: 'REJECTED', reviewNotes: 'Site closed at 17:00' });
    expect(review.status).toBe(200);

    const [day] = await daysOf(e.employeeId);
    expect(day.status).toBe(DayStatus.MISSING_CLOCK_OUT);
    expect(day.segments[0].clockOut).toBeNull();
    const corr = await prisma.timeCorrectionRequest.findUniqueOrThrow({ where: { id } });
    expect(corr.reviewNotes).toBe('Site closed at 17:00');
    expect(await prisma.auditLog.count({ where: { action: AuditAction.REJECT_CORRECTION, entityId: id } })).toBe(1);
  });
});

describe('spec §31 example day and timezone handling', () => {
  it('reconstructs the example day: ABC 5h, XYZ 3h, break 1h, presence 9h, working 8h', async () => {
    const e = await newEmployee();
    await e.post('/start', { projectId: projA.id, locationType: 'OFFICE', activityType: 'DESIGN' }); // 08:00
    at('2026-11-10T10:00:00Z'); // 11:00
    await e.post('/location', { locationType: 'SITE' });
    await e.post('/activity', { activityType: 'SITE_INSPECTION' });
    at('2026-11-10T12:00:00Z'); // 13:00
    await e.post('/breaks/start', { breakType: 'LUNCH' });
    at('2026-11-10T13:00:00Z'); // 14:00
    await e.post('/breaks/end');
    await e.post('/project', { projectId: projB.id, locationType: 'OFFICE', activityType: 'DOCUMENTATION' });
    at('2026-11-10T16:00:00Z'); // 17:00
    await e.post('/end');

    const [day] = await daysOf(e.employeeId);
    const net = (projectId: string) =>
      day.segments
        .filter((s) => s.projectId === projectId)
        .reduce((sum, s) => sum + s.durationSeconds! - s.breaks.reduce((b, x) => b + x.durationSeconds!, 0), 0);

    expect(net(projA.id)).toBe(5 * H);
    expect(net(projB.id)).toBe(3 * H);
    expect(day.totalBreakSeconds).toBe(1 * H);
    expect(day.totalWorkSeconds).toBe(9 * H);
    expect(day.totalWorkSeconds - day.totalBreakSeconds).toBe(8 * H);
    expect(day.segments.map((s) => s.location)).toEqual(['OFFICE', 'SITE', 'OFFICE']);
    expect(day.segments[1].activities.map((a) => a.activityType)).toEqual(['DESIGN', 'SITE_INSPECTION']);
  });

  it('overnight work stays on the start day', async () => {
    const e = await newEmployee();
    at('2026-11-12T21:00:00Z'); // 22:00 Lagos
    await e.post('/start', { projectId: projA.id });
    at('2026-11-13T01:00:00Z'); // 02:00 Lagos next day
    const today = await request(app).get('/api/v1/time/today').set(auth(e.token));
    expect(today.body.data.today.workingSeconds).toBe(4 * H);
    await e.post('/end');
    const days = await daysOf(e.employeeId);
    expect(days).toHaveLength(1);
    expect(days[0].date.toISOString().slice(0, 10)).toBe('2026-11-12');
    expect(days[0].totalWorkSeconds).toBe(4 * H);
  });

  it('the workday is the Lagos date, not the UTC date', async () => {
    const e = await newEmployee();
    at('2026-11-14T23:30:00Z'); // 00:30 Lagos on the 15th
    await e.post('/start', { projectId: projA.id });
    const [day] = await daysOf(e.employeeId);
    expect(day.date.toISOString().slice(0, 10)).toBe('2026-11-15');
  });

  it('client-sent times are ignored', async () => {
    const e = await newEmployee();
    await e.post('/start', { projectId: projA.id, clockIn: '2020-01-01T00:00:00Z', startTime: '2020-01-01T00:00:00Z' });
    const [day] = await daysOf(e.employeeId);
    expect(day.segments[0].clockIn.toISOString()).toBe('2026-11-10T07:00:00.000Z');
  });
});

describe('correction overlap', () => {
  it('rejects a correction that overlaps another segment', async () => {
    const e = await newEmployee();
    await e.post('/start', { projectId: projA.id });
    at('2026-11-10T10:00:00Z');
    await e.post('/project', { projectId: projB.id });
    at('2026-11-10T12:00:00Z');
    await e.post('/end');
    const [day] = await daysOf(e.employeeId);

    // Stretching the first segment to 11:00 would overlap the second one (10:00-12:00).
    const res = await request(app)
      .post('/api/v1/corrections')
      .set(auth(e.token))
      .send({
        workDayId: day.id,
        reason: 'Clocked project B too early',
        requestedChanges: {
          segmentId: day.segments[0].id,
          proposedClockIn: '2026-11-10T07:00:00Z',
          proposedClockOut: '2026-11-10T11:00:00Z',
        },
      });
    expect(res.status).toBe(400);

    // Shortening it does not overlap and is accepted.
    const ok = await request(app)
      .post('/api/v1/corrections')
      .set(auth(e.token))
      .send({
        workDayId: day.id,
        reason: 'Started later than recorded',
        requestedChanges: {
          segmentId: day.segments[0].id,
          proposedClockIn: '2026-11-10T07:30:00Z',
          proposedClockOut: '2026-11-10T10:00:00Z',
        },
      });
    expect(ok.status).toBe(201);
  });
});

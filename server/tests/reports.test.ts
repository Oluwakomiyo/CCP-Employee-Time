import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { app, auth, createProject, createUser, login, resetDb } from './helpers';

const at = (iso: string) => vi.setSystemTime(new Date(iso));

let tCeo: string;
let tPm: string;
let tOtherPm: string;
let tJohn: string;
let john: Awaited<ReturnType<typeof createUser>>;
let abc: { id: string };
let xyz: { id: string };

/** Builds the spec §31 example day for John through the real API (times are Lagos = UTC+1). */
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at('2026-11-10T06:00:00Z');
  await resetDb();
  const ceo = await createUser(Role.CEO_ADMIN);
  const pm = await createUser(Role.PROJECT_MANAGER);
  const otherPm = await createUser(Role.PROJECT_MANAGER);
  john = await createUser(Role.EMPLOYEE, { rate: 5000 });
  abc = await createProject('ABC', [{ employeeId: pm.employeeId, lead: true }, { employeeId: john.employeeId }]);
  xyz = await createProject('XYZ', [{ employeeId: pm.employeeId, lead: true }, { employeeId: john.employeeId }]);
  await prisma.project.update({ where: { id: abc.id }, data: { estimatedHours: 20 } });
  [tCeo, tPm, tOtherPm, tJohn] = await Promise.all([login(ceo.email), login(pm.email), login(otherPm.email), login(john.email)]);

  const post = (path: string, body: object = {}) => request(app).post(`/api/v1/time${path}`).set(auth(tJohn)).send(body);
  at('2026-11-10T07:00:00Z');
  await post('/start', { projectId: abc.id, locationType: 'OFFICE', activityType: 'DESIGN' });
  at('2026-11-10T10:00:00Z');
  await post('/location', { locationType: 'SITE' });
  await post('/activity', { activityType: 'SITE_INSPECTION' });
  at('2026-11-10T12:00:00Z');
  await post('/breaks/start', { breakType: 'LUNCH' });
  at('2026-11-10T13:00:00Z');
  await post('/breaks/end');
  await post('/project', { projectId: xyz.id, locationType: 'OFFICE', activityType: 'DOCUMENTATION' });
  at('2026-11-10T16:00:00Z');
  await post('/end');
  at('2026-11-10T17:00:00Z');
});

afterAll(() => vi.useRealTimers());

describe('project report (spec §33, §34)', () => {
  it('CEO sees hours by employee, location and activity plus labour cost', async () => {
    const res = await request(app).get(`/api/v1/management/projects/${abc.id}/report`).set(auth(tCeo));
    expect(res.status).toBe(200);
    const r = res.body.data;
    expect(r.totalHours).toBe(5);
    expect(r.hoursByLocation).toEqual([
      { location: 'OFFICE', hours: 3 },
      { location: 'SITE', hours: 2 },
    ]);
    expect(r.hoursByActivity).toEqual([
      { activityType: 'DESIGN', hours: 3 },
      { activityType: 'SITE_INSPECTION', hours: 2 },
    ]);
    expect(r.hoursByEmployee[0]).toMatchObject({ employeeId: john.employeeId, hours: 5, labourCost: 25000 });
    expect(r.labourCost).toBe(25000);
    expect(r.remainingEstimatedHours).toBe(15);
    expect(r.overEstimate).toBe(false);
  });

  it('PM lead sees hours but no money; other PMs and employees are refused', async () => {
    const pm = await request(app).get(`/api/v1/management/projects/${abc.id}/report`).set(auth(tPm));
    expect(pm.status).toBe(200);
    expect(JSON.stringify(pm.body)).not.toMatch(/labourCost|hourlyRate/i);
    expect((await request(app).get(`/api/v1/management/projects/${abc.id}/report`).set(auth(tOtherPm))).status).toBe(403);
    expect((await request(app).get(`/api/v1/management/projects/${abc.id}/report`).set(auth(tJohn))).status).toBe(403);
  });

  it('remaining hours never go negative and overruns are flagged', async () => {
    await prisma.project.update({ where: { id: abc.id }, data: { estimatedHours: 4 } });
    const r = (await request(app).get(`/api/v1/management/projects/${abc.id}/report`).set(auth(tCeo))).body.data;
    expect(r.remainingEstimatedHours).toBe(0);
    expect(r.overEstimate).toBe(true);
    expect(r.overByHours).toBe(1);
    await prisma.project.update({ where: { id: abc.id }, data: { estimatedHours: 20 } });
  });
});

describe('employee report (spec §35, §36)', () => {
  it('reconstructs the example day', async () => {
    const res = await request(app).get(`/api/v1/management/employees/${john.employeeId}/report`).set(auth(tPm));
    expect(res.status).toBe(200);
    const r = res.body.data;
    expect(r.totalWorkingHours).toBe(8);
    expect(r.presenceHours).toBe(9);
    expect(r.breakHours).toBe(1);
    expect(r.averageDailyHours).toBe(8);
    expect(r.validWorkingDays).toBe(1);
    expect(r.hoursByProject.map((p: { code: string; hours: number }) => [p.code, p.hours])).toEqual([
      ['ABC', 5],
      ['XYZ', 3],
    ]);
    expect(r.hoursByActivity).toEqual([
      { activityType: 'DESIGN', hours: 3 },
      { activityType: 'DOCUMENTATION', hours: 3 },
      { activityType: 'SITE_INSPECTION', hours: 2 },
    ]);
  });

  it('employees get their own report without money and cannot read others', async () => {
    const me = await request(app).get('/api/v1/me/report').set(auth(tJohn));
    expect(me.status).toBe(200);
    expect(me.body.data.totalWorkingHours).toBe(8);
    expect(JSON.stringify(me.body)).not.toMatch(/rate|cost|gross|pay/i);
    const other = await createUser(Role.EMPLOYEE);
    expect((await request(app).get(`/api/v1/management/employees/${other.employeeId}/report`).set(auth(tJohn))).status).toBe(403);
    expect((await request(app).get(`/api/v1/management/employees/${john.employeeId}/report`).set(auth(tOtherPm))).status).toBe(403);
  });
});

describe('estimate (spec §37)', () => {
  it('divides remaining hours by the team daily average; cost only for the CEO', async () => {
    const ceo = await request(app)
      .get(`/api/v1/management/estimate?projectId=${abc.id}&employeeIds=${john.employeeId}`)
      .set(auth(tCeo));
    expect(ceo.status).toBe(200);
    expect(ceo.body.data).toMatchObject({
      basis: 'REMAINING_ESTIMATE',
      estimatedHoursToDo: 15,
      teamDailyHours: 8,
      estimatedWorkingDays: 1.9,
      estimatedLabourCost: 75000,
    });
    const pm = await request(app)
      .get(`/api/v1/management/estimate?projectId=${abc.id}&employeeIds=${john.employeeId}`)
      .set(auth(tPm));
    expect(pm.body.data.estimatedLabourCost).toBeUndefined();
  });

  it('validates the employee list', async () => {
    const res = await request(app).get(`/api/v1/management/estimate?projectId=${abc.id}&employeeIds=not-a-uuid`).set(auth(tCeo));
    expect(res.status).toBe(400);
  });
});

describe('dashboard and live status (spec §46, §47)', () => {
  it('shows who is working, on break or not started', async () => {
    const mary = await createUser(Role.EMPLOYEE);
    await prisma.projectMember.create({ data: { projectId: abc.id, employeeId: mary.employeeId } });
    const tMary = await login(mary.email);
    await request(app).post('/api/v1/time/start').set(auth(tMary)).send({ projectId: abc.id, locationType: 'SITE' });

    const status = (await request(app).get('/api/v1/management/status').set(auth(tCeo))).body.data;
    const state = (id: string) => status.find((s: { employee: { id: string } }) => s.employee.id === id)?.state;
    expect(state(mary.employeeId)).toBe('WORKING');
    expect(state(john.employeeId)).toBe('FINISHED');

    const dash = (await request(app).get('/api/v1/management/dashboard').set(auth(tCeo))).body.data;
    expect(dash.cards.employeesWorkingToday).toBe(1);
    expect(dash.cards.activeProjects).toBe(2);
    expect(dash.charts.hoursByProject.find((p: { code: string }) => p.code === 'XYZ').hours).toBe(3);
  });

  it('a PM only sees employees on projects they lead', async () => {
    const status = (await request(app).get('/api/v1/management/status').set(auth(tOtherPm))).body.data;
    expect(status.map((s: { employee: { id: string } }) => s.employee.id)).not.toContain(john.employeeId);
  });

  it('employees cannot reach management endpoints', async () => {
    for (const path of ['/dashboard', '/status', `/estimate?projectId=${abc.id}&employeeIds=${john.employeeId}`]) {
      expect((await request(app).get(`/api/v1/management${path}`).set(auth(tJohn))).status).toBe(403);
    }
  });
});

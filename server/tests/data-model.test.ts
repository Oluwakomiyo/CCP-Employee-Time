import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role, DayStatus, SegmentStatus, ProjectStatus } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { app, auth, createProject, createUser, login, resetDb } from './helpers';

let ceo: Awaited<ReturnType<typeof createUser>>;
let pm: Awaited<ReturnType<typeof createUser>>;
let tCeo: string;
let tPm: string;

const H = 3600;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** A finished day with `netHours` of work and no breaks. */
const workedDay = async (employeeId: string, projectId: string, date: string, netHours: number) =>
  prisma.workDay.create({
    data: {
      employeeId,
      date: d(date),
      status: DayStatus.COMPLETED,
      totalWorkSeconds: netHours * H,
      segments: {
        create: {
          projectId,
          status: SegmentStatus.COMPLETED,
          clockIn: new Date(`${date}T07:00:00Z`),
          clockOut: new Date(new Date(`${date}T07:00:00Z`).getTime() + netHours * H * 1000),
          durationSeconds: netHours * H,
        },
      },
    },
  });

beforeAll(async () => {
  await resetDb();
  ceo = await createUser(Role.CEO_ADMIN);
  pm = await createUser(Role.PROJECT_MANAGER);
  [tCeo, tPm] = await Promise.all([login(ceo.email), login(pm.email)]);
});

describe('compensation history (spec §20)', () => {
  it('a rate change closes the old rate and opens a new one', async () => {
    const e = await createUser(Role.EMPLOYEE, { rate: 4000 }); // effective from 2026-01-01
    const res = await request(app)
      .put(`/api/v1/employees/${e.employeeId}/compensation`)
      .set(auth(tCeo))
      .send({ baseHourlyRate: 5000, overtimeHourlyRate: 7500, currency: 'NGN', effectiveDate: '2026-07-01' });
    expect(res.status).toBe(200);

    const rows = await prisma.compensation.findMany({ where: { employeeId: e.employeeId }, orderBy: { effectiveFrom: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0].baseHourlyRate.toNumber()).toBe(4000);
    expect(rows[0].effectiveTo?.toISOString().slice(0, 10)).toBe('2026-06-30');
    expect(rows[1].baseHourlyRate.toNumber()).toBe(5000);
    expect(rows[1].effectiveTo).toBeNull();

    const history = await request(app).get(`/api/v1/employees/${e.employeeId}/compensation`).set(auth(tCeo));
    expect(history.body.data.history).toHaveLength(2);
    expect(history.body.data.current.baseHourlyRate).toBe('5000');
  });

  it('rejects a change that does not start after the current rate', async () => {
    const e = await createUser(Role.EMPLOYEE);
    const res = await request(app)
      .put(`/api/v1/employees/${e.employeeId}/compensation`)
      .set(auth(tCeo))
      .send({ baseHourlyRate: 6000, overtimeHourlyRate: 9000, currency: 'NGN', effectiveDate: '2025-12-01' });
    expect(res.status).toBe(400);
  });

  it('payroll prices each day at the rate in force that day', async () => {
    const e = await createUser(Role.EMPLOYEE, { rate: 4000 });
    const p = await createProject('PAY-1', [{ employeeId: e.employeeId }]);
    await request(app)
      .put(`/api/v1/employees/${e.employeeId}/compensation`)
      .set(auth(tCeo))
      .send({ baseHourlyRate: 5000, overtimeHourlyRate: 7500, currency: 'NGN', effectiveDate: '2026-11-11' });
    await workedDay(e.employeeId, p.id, '2026-11-10', 8);
    await workedDay(e.employeeId, p.id, '2026-11-11', 8);

    const res = await request(app)
      .post('/api/v1/payroll/generate')
      .set(auth(tCeo))
      .send({ periodStart: '2026-11-01', periodEnd: '2026-11-30', employeeId: e.employeeId });
    expect(res.status).toBe(201);
    const rec = await prisma.payrollRecord.findFirstOrThrow({ where: { employeeId: e.employeeId } });
    expect(rec.grossPay.toNumber()).toBe(8 * 4000 + 8 * 5000);
    expect(rec.regularHours.toNumber()).toBe(16);
  });

  it('pays people who left during the period', async () => {
    const e = await createUser(Role.EMPLOYEE, { rate: 3000 });
    const p = await createProject('PAY-2', [{ employeeId: e.employeeId }]);
    await workedDay(e.employeeId, p.id, '2026-11-03', 6);
    await prisma.employee.update({ where: { id: e.employeeId }, data: { status: 'TERMINATED' } });

    await request(app).post('/api/v1/payroll/generate').set(auth(tCeo)).send({ periodStart: '2026-11-01', periodEnd: '2026-11-30' });
    const rec = await prisma.payrollRecord.findFirstOrThrow({ where: { employeeId: e.employeeId } });
    expect(rec.grossPay.toNumber()).toBe(18000);
  });
});

describe('project membership history (spec §22)', () => {
  it('removal keeps the row, blocks new time, and re-adding creates a new membership', async () => {
    const e = await createUser(Role.EMPLOYEE);
    const p = await createProject('MEM-1', [{ employeeId: pm.employeeId, lead: true }, { employeeId: e.employeeId }]);
    const tEmp = await login(e.email);

    expect((await request(app).delete(`/api/v1/projects/${p.id}/members/${e.employeeId}`).set(auth(tPm))).status).toBe(200);
    const rows = await prisma.projectMember.findMany({ where: { projectId: p.id, employeeId: e.employeeId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].removedAt).not.toBeNull();

    expect((await request(app).post('/api/v1/time/start').set(auth(tEmp)).send({ projectId: p.id })).status).toBe(403);

    const again = await request(app).post(`/api/v1/projects/${p.id}/members`).set(auth(tPm)).send({ employeeId: e.employeeId });
    expect(again.status).toBe(201);
    expect(await prisma.projectMember.count({ where: { projectId: p.id, employeeId: e.employeeId } })).toBe(2);
  });

  it('only the CEO appoints or removes a project lead', async () => {
    const e = await createUser(Role.EMPLOYEE);
    const p = await createProject('MEM-2', [{ employeeId: pm.employeeId, lead: true }]);
    const res = await request(app)
      .post(`/api/v1/projects/${p.id}/members`)
      .set(auth(tPm))
      .send({ employeeId: e.employeeId, isProjectLead: true });
    expect(res.status).toBe(403);
    expect((await request(app).delete(`/api/v1/projects/${p.id}/members/${pm.employeeId}`).set(auth(tPm))).status).toBe(403);
  });
});

describe('projects (spec §21)', () => {
  it('stores details and status; work cannot start on a project that is not active', async () => {
    const e = await createUser(Role.EMPLOYEE);
    const res = await request(app)
      .post('/api/v1/projects')
      .set(auth(tCeo))
      .send({
        code: 'det-1',
        name: 'Details Project',
        clientName: 'Client Co',
        location: 'Abuja',
        estimatedHours: 340,
        status: 'ON_HOLD',
        startDate: '2026-11-01',
      });
    expect(res.status).toBe(201);
    const p = await prisma.project.findUniqueOrThrow({ where: { code: 'DET-1' } });
    expect(p.status).toBe(ProjectStatus.ON_HOLD);
    expect(p.estimatedHours?.toNumber()).toBe(340);
    expect(p.createdById).toBe(ceo.userId);

    await prisma.projectMember.create({ data: { projectId: p.id, employeeId: e.employeeId } });
    const start = await request(app).post('/api/v1/time/start').set(auth(await login(e.email))).send({ projectId: p.id });
    expect(start.status).toBe(400);
  });

  it('rejects an end date before the start date', async () => {
    const res = await request(app)
      .post('/api/v1/projects')
      .set(auth(tCeo))
      .send({ code: 'BAD-1', name: 'Bad dates', startDate: '2026-11-10', endDate: '2026-11-01' });
    expect(res.status).toBe(400);
  });

  it('a project with recorded time cannot be deleted; an empty one can', async () => {
    const e = await createUser(Role.EMPLOYEE);
    const used = await createProject('DEL-1', [{ employeeId: e.employeeId }]);
    await workedDay(e.employeeId, used.id, '2026-11-05', 2);
    const blocked = await request(app).delete(`/api/v1/projects/${used.id}`).set(auth(tCeo));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('PROJECT_HAS_HISTORY');

    const empty = await createProject('DEL-2', []);
    expect((await request(app).delete(`/api/v1/projects/${empty.id}`).set(auth(tCeo))).status).toBe(200);
  });
});

describe('departments', () => {
  it('renaming a department updates its employees', async () => {
    const e = await createUser(Role.EMPLOYEE); // department "Design"
    const dept = await prisma.department.findUniqueOrThrow({ where: { name: 'Design' } });
    const res = await request(app).patch(`/api/v1/departments/${dept.id}`).set(auth(tCeo)).send({ name: 'Architecture & Design' });
    expect(res.status).toBe(200);
    const emp = await prisma.employee.findUniqueOrThrow({ where: { id: e.employeeId } });
    expect(emp.department).toBe('Architecture & Design');
    // restore for other tests
    await prisma.department.update({ where: { id: dept.id }, data: { name: 'Design' } });
  });

  it('employees cannot manage departments', async () => {
    const e = await createUser(Role.EMPLOYEE);
    const res = await request(app).post('/api/v1/departments').set(auth(await login(e.email))).send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });
});

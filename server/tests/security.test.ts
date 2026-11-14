import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role, SegmentStatus, DayStatus } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { app, auth, createProject, createUser, login, resetDb, PASSWORD } from './helpers';

let ceo: Awaited<ReturnType<typeof createUser>>;
let pm: Awaited<ReturnType<typeof createUser>>;
let emp1: Awaited<ReturnType<typeof createUser>>;
let emp2: Awaited<ReturnType<typeof createUser>>;
let projA: { id: string };
let projB: { id: string };
let tCeo: string;
let tPm: string;
let tEmp1: string;

beforeAll(async () => {
  await resetDb();
  ceo = await createUser(Role.CEO_ADMIN);
  pm = await createUser(Role.PROJECT_MANAGER);
  emp1 = await createUser(Role.EMPLOYEE);
  emp2 = await createUser(Role.EMPLOYEE);
  projA = await createProject('PRJ-A', [{ employeeId: pm.employeeId, lead: true }, { employeeId: emp1.employeeId }]);
  projB = await createProject('PRJ-B', [{ employeeId: emp2.employeeId }]);
  [tCeo, tPm, tEmp1] = await Promise.all([login(ceo.email), login(pm.email), login(emp1.email)]);
});

describe('employee cannot reach management data (spec §4, §61)', () => {
  const forbidden: [string, string][] = [
    ['get', '/api/v1/payroll'],
    ['post', '/api/v1/payroll/generate'],
    ['get', '/api/v1/employees'],
    ['get', '/api/v1/audit/logs'],
    ['post', '/api/v1/activity/devices'],
  ];
  it.each(forbidden)('%s %s -> 403', async (method, path) => {
    const res = await (request(app) as any)[method](path).set(auth(tEmp1)).send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('cannot read another employee, compensation, or project cost', async () => {
    expect((await request(app).get(`/api/v1/employees/${emp2.employeeId}`).set(auth(tEmp1))).status).toBe(403);
    expect((await request(app).get(`/api/v1/employees/${emp1.employeeId}/compensation`).set(auth(tEmp1))).status).toBe(403);
    expect((await request(app).get(`/api/v1/projects/${projA.id}/cost-breakdown`).set(auth(tEmp1))).status).toBe(403);
  });

  it('pay-slip endpoint is gone', async () => {
    expect((await request(app).get('/api/v1/payroll/my-slips').set(auth(tEmp1))).status).toBe(404);
  });

  it('own profile contains no compensation fields', async () => {
    const res = await request(app).get(`/api/v1/employees/${emp1.employeeId}`).set(auth(tEmp1));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/hourlyRate|grossPay|compensation"\s*:\s*\{/i);
  });
});

describe('project manager scope', () => {
  it('sees cost breakdown only for projects they lead, without money', async () => {
    const a = await request(app).get(`/api/v1/projects/${projA.id}/cost-breakdown`).set(auth(tPm));
    expect(a.status).toBe(200);
    expect(JSON.stringify(a.body)).not.toMatch(/hourlyRate/i);
    expect((await request(app).get(`/api/v1/projects/${projB.id}/cost-breakdown`).set(auth(tPm))).status).toBe(403);
  });

  it('cannot register devices', async () => {
    const res = await request(app).post('/api/v1/activity/devices').set(auth(tPm)).send({});
    expect(res.status).toBe(403);
  });
});

describe('passwords (spec §5)', () => {
  it('create employee returns a one-time temp password that forces a change', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set(auth(tCeo))
      .send({
        email: 'new.hire@test.local',
        role: 'EMPLOYEE',
        employeeCode: 'NEW-001',
        firstName: 'New',
        lastName: 'Hire',
        department: 'Design',
        position: 'Architect',
        hireDate: '2026-11-01',
        compensation: { baseHourlyRate: 4000, overtimeHourlyRate: 6000, currency: 'NGN' },
      });
    expect(res.status).toBe(201);
    const temp = res.body.data.temporaryPassword as string;
    expect(temp).toHaveLength(16);

    const token = await login('new.hire@test.local', temp);
    const blocked = await request(app).get('/api/v1/projects').set(auth(token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await request(app).get('/api/v1/auth/me').set(auth(token))).status).toBe(200);

    const changed = await request(app)
      .post('/api/v1/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: temp, newPassword: 'Brand-new-pass-42' });
    expect(changed.status).toBe(200);
    expect((await request(app).get('/api/v1/projects').set(auth(token))).status).toBe(200);
  });

  it('employee list never exposes password material', async () => {
    const res = await request(app).get('/api/v1/employees').set(auth(tCeo));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/password(Hash)?"|managedPassword|refreshTokenHash/);
  });

  it('reset issues a new temp password and revokes the refresh token', async () => {
    const res = await request(app).patch(`/api/v1/employees/${emp2.employeeId}/password`).set(auth(tCeo)).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.temporaryPassword).toHaveLength(16);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: emp2.userId } });
    expect(user.mustChangePassword).toBe(true);
    expect(user.refreshTokenHash).toBeNull();
  });
});

describe('audit log hygiene (spec §76)', () => {
  it('never stores credential hashes', async () => {
    await request(app).patch(`/api/v1/employees/${emp1.employeeId}`).set(auth(tCeo)).send({ position: 'Senior Architect' });
    const logs = await prisma.auditLog.findMany();
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toMatch(/passwordHash|refreshTokenHash|managedPassword/);
  });

  it('rows cannot be updated or deleted', async () => {
    const log = await prisma.auditLog.findFirstOrThrow();
    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow();
    await expect(prisma.auditLog.update({ where: { id: log.id }, data: { entityName: 'x' } })).rejects.toThrow();
  });
});

describe('sessions', () => {
  it('login sets httpOnly cookies that authenticate on their own', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: emp1.email, password: PASSWORD });
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.some((c) => c.startsWith('ccp_at=') && /HttpOnly/i.test(c))).toBe(true);
    const at = cookies.find((c) => c.startsWith('ccp_at='))!.split(';')[0];
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', at)).status).toBe(200);
  });

  it('deactivated user is locked out immediately', async () => {
    const victim = await createUser(Role.EMPLOYEE);
    const token = await login(victim.email);
    expect((await request(app).delete(`/api/v1/employees/${victim.employeeId}`).set(auth(tCeo))).status).toBe(200);
    expect((await request(app).get('/api/v1/auth/me').set(auth(token))).status).toBe(401);
    // soft delete: the record still exists
    expect(await prisma.employee.findUnique({ where: { id: victim.employeeId } })).not.toBeNull();
  });
});

describe('correction IDOR (spec §16)', () => {
  it('cannot point a correction at another employee\'s segment', async () => {
    const date = new Date('2026-11-10T00:00:00Z');
    const day1 = await prisma.workDay.create({ data: { employeeId: emp1.employeeId, date, status: DayStatus.COMPLETED } });
    const day2 = await prisma.workDay.create({
      data: {
        employeeId: emp2.employeeId,
        date,
        status: DayStatus.COMPLETED,
        segments: {
          create: {
            projectId: projB.id,
            status: SegmentStatus.COMPLETED,
            clockIn: new Date('2026-11-10T08:00:00Z'),
            clockOut: new Date('2026-11-10T16:00:00Z'),
            durationSeconds: 8 * 3600,
          },
        },
      },
      include: { segments: true },
    });

    const res = await request(app)
      .post('/api/v1/corrections')
      .set(auth(tEmp1))
      .send({
        workDayId: day1.id,
        reason: 'Trying to edit a colleague',
        requestedChanges: {
          segmentId: day2.segments[0].id,
          proposedClockIn: '2026-11-10T08:00:00Z',
          proposedClockOut: '2026-11-10T09:00:00Z',
        },
      });
    expect(res.status).toBe(400);

    const notMine = await request(app)
      .post('/api/v1/corrections')
      .set(auth(tEmp1))
      .send({
        workDayId: day1.id,
        reason: 'Adding time to a project I am not on',
        requestedChanges: {
          projectId: projB.id,
          proposedClockIn: '2026-11-10T08:00:00Z',
          proposedClockOut: '2026-11-10T09:00:00Z',
        },
      });
    expect(notMine.status).toBe(400);
  });
});

describe('error handling', () => {
  it('unknown route -> 404 envelope', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('malformed JSON -> 400', async () => {
    const res = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('PM correction review scope', () => {
  it('PM cannot review a correction from an employee outside their projects', async () => {
    const day = await prisma.workDay.create({
      data: { employeeId: emp2.employeeId, date: new Date('2026-11-11T00:00:00Z'), status: DayStatus.COMPLETED },
    });
    const corr = await prisma.timeCorrectionRequest.create({
      data: {
        workDayId: day.id,
        employeeId: emp2.employeeId,
        reason: 'Forgot to clock out',
        requestedChanges: { projectId: projB.id, proposedClockIn: '2026-11-11T08:00:00Z', proposedClockOut: '2026-11-11T16:00:00Z' },
      },
    });
    const res = await request(app)
      .patch(`/api/v1/corrections/${corr.id}/review`)
      .set(auth(tPm))
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(403);
    const list = await request(app).get('/api/v1/corrections').set(auth(tPm));
    expect(list.body.data.some((c: { id: string }) => c.id === corr.id)).toBe(false);
  });
});

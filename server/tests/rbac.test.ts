import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { app, auth, createProject, createUser, login, resetDb } from './helpers';

let ceo: Awaited<ReturnType<typeof createUser>>;
let pm: Awaited<ReturnType<typeof createUser>>;
let emp1: Awaited<ReturnType<typeof createUser>>;
let emp2: Awaited<ReturnType<typeof createUser>>;
let emp3: Awaited<ReturnType<typeof createUser>>;
let projA: { id: string };
let tCeo: string;
let tPm: string;

const roles = async () => (await request(app).get('/api/v1/roles').set(auth(tCeo))).body.data as { id: string; key: string; permissions: Record<string, unknown> }[];
const roleByKey = async (key: string) => (await roles()).find((r) => r.key === key)!;

beforeAll(async () => {
  await resetDb();
  ceo = await createUser(Role.CEO_ADMIN);
  pm = await createUser(Role.PROJECT_MANAGER);
  emp1 = await createUser(Role.EMPLOYEE);
  emp2 = await createUser(Role.EMPLOYEE);
  emp3 = await createUser(Role.EMPLOYEE);
  projA = await createProject('PRJ-A', [{ employeeId: pm.employeeId, lead: true }, { employeeId: emp1.employeeId }]);
  [tCeo, tPm] = await Promise.all([login(ceo.email), login(pm.email)]);
});

describe('custom roles', () => {
  it('an "SEO specialist" with only reports can read reports and nothing else', async () => {
    const created = await request(app)
      .post('/api/v1/roles')
      .set(auth(tCeo))
      .send({ name: 'SEO specialist', permissions: { 'time.track': true, 'reports.view': 'ALL' } });
    expect(created.status).toBe(201);
    expect((await request(app).put(`/api/v1/roles/assign/${emp2.employeeId}`).set(auth(tCeo)).send({ roleId: created.body.data.id })).status).toBe(200);

    const t = await login(emp2.email);
    expect((await request(app).get(`/api/v1/management/projects/${projA.id}/report`).set(auth(t))).status).toBe(200);
    expect((await request(app).get('/api/v1/payroll').set(auth(t))).status).toBe(403);
    expect((await request(app).get('/api/v1/employees').set(auth(t))).status).toBe(403);
    expect((await request(app).post('/api/v1/departments').set(auth(t)).send({ name: 'SEO' })).status).toBe(403);

    const me = await request(app).get('/api/v1/auth/me').set(auth(t));
    expect(me.body.data.user.roleInfo.name).toBe('SEO specialist');
    expect(me.body.data.user.permissions).toEqual({ 'time.track': true, 'reports.view': 'ALL' });
  });

  it('rejects unknown permissions and scopes on plain switches', async () => {
    expect((await request(app).post('/api/v1/roles').set(auth(tCeo)).send({ name: 'Bad', permissions: { 'rocket.launch': true } })).status).toBe(400);
    expect((await request(app).post('/api/v1/roles').set(auth(tCeo)).send({ name: 'Bad', permissions: { 'payroll.view': 'ALL' } })).status).toBe(400);
  });

  it('a role in use cannot be deleted; an unused one can', async () => {
    const seo = await roleByKey('seo_specialist');
    expect((await request(app).delete(`/api/v1/roles/${seo.id}`).set(auth(tCeo))).status).toBe(409);
    const spare = await request(app).post('/api/v1/roles').set(auth(tCeo)).send({ name: 'Spare', copyFrom: (await roleByKey('employee')).id });
    expect(spare.body.data.permissions['time.track']).toBe(true);
    expect((await request(app).delete(`/api/v1/roles/${spare.body.data.id}`).set(auth(tCeo))).status).toBe(200);
  });

  it('only roles.manage can touch roles', async () => {
    expect((await request(app).get('/api/v1/roles/catalog').set(auth(tPm))).status).toBe(403);
    expect((await request(app).post('/api/v1/roles').set(auth(tPm)).send({ name: 'Mine' })).status).toBe(403);
  });
});

describe('editing presets', () => {
  it('a change applies on the next request, and reset restores the preset', async () => {
    const admin = await roleByKey('ceo_admin');
    const without = { ...admin.permissions };
    delete without['payroll.view'];
    delete without['payroll.manage'];
    expect((await request(app).patch(`/api/v1/roles/${admin.id}`).set(auth(tCeo)).send({ permissions: without })).status).toBe(200);
    expect((await request(app).get('/api/v1/payroll').set(auth(tCeo))).status).toBe(403);

    expect((await request(app).post(`/api/v1/roles/${admin.id}/reset`).set(auth(tCeo))).status).toBe(200);
    expect((await request(app).get('/api/v1/payroll?periodStart=2026-11-01&periodEnd=2026-11-30').set(auth(tCeo))).status).toBe(200);

    const logs = await prisma.auditLog.findMany({ where: { entityName: 'Role', entityId: admin.id } });
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });

  it('the admin role keeps roles.manage, and the last role admin cannot be moved out', async () => {
    const admin = await roleByKey('ceo_admin');
    const without = { ...admin.permissions };
    delete without['roles.manage'];
    expect((await request(app).patch(`/api/v1/roles/${admin.id}`).set(auth(tCeo)).send({ permissions: without })).status).toBe(400);

    const employee = await roleByKey('employee');
    const res = await request(app).put(`/api/v1/roles/assign/${ceo.employeeId}`).set(auth(tCeo)).send({ roleId: employee.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_ROLE_ADMIN');
  });
});

describe('no privilege escalation', () => {
  it('someone who can add people but not manage roles cannot hand out more than they have', async () => {
    const hr = await request(app)
      .post('/api/v1/roles')
      .set(auth(tCeo))
      .send({ name: 'HR', permissions: { 'employees.view': 'ALL', 'employees.manage': true } });
    await request(app).put(`/api/v1/roles/assign/${emp3.employeeId}`).set(auth(tCeo)).send({ roleId: hr.body.data.id });
    const t = await login(emp3.email);

    const admin = await roleByKey('ceo_admin');
    expect((await request(app).put(`/api/v1/roles/assign/${emp1.employeeId}`).set(auth(t)).send({ roleId: admin.id })).status).toBe(403);
    const created = await request(app)
      .post('/api/v1/employees')
      .set(auth(t))
      .send({
        email: 'sneaky@test.local', roleId: admin.id, firstName: 'S', lastName: 'N', department: 'Design', position: 'Architect',
        hireDate: '2026-11-01', compensation: { baseHourlyRate: 1, overtimeHourlyRate: 1, currency: 'NGN' },
      });
    expect(created.status).toBe(403);
  });
});

describe('team scope (project manager preset)', () => {
  it('a PM sees only people on projects they lead', async () => {
    const list = await request(app).get('/api/v1/employees?limit=100').set(auth(tPm));
    const ids = list.body.data.map((e: { id: string }) => e.id);
    expect(ids).toContain(emp1.employeeId);
    expect(ids).not.toContain(emp3.employeeId);
    expect((await request(app).get(`/api/v1/employees/${emp1.employeeId}`).set(auth(tPm))).status).toBe(200);
    expect((await request(app).get(`/api/v1/employees/${emp3.employeeId}`).set(auth(tPm))).status).toBe(403);
    expect((await request(app).get(`/api/v1/time/history?all=true&employeeId=${emp3.employeeId}`).set(auth(tPm))).status).toBe(403);
  });
});

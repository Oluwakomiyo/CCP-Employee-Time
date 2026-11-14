import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role, DayStatus } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { app, auth, createProject, createUser, login, resetDb } from './helpers';

let ceo: Awaited<ReturnType<typeof createUser>>;
let pm: Awaited<ReturnType<typeof createUser>>;
let emp: Awaited<ReturnType<typeof createUser>>;
let tCeo: string;
let tPm: string;

beforeAll(async () => {
  await resetDb();
  ceo = await createUser(Role.CEO_ADMIN);
  pm = await createUser(Role.PROJECT_MANAGER);
  emp = await createUser(Role.EMPLOYEE);
  await createProject('EV-1', [{ employeeId: pm.employeeId, lead: true }, { employeeId: emp.employeeId }]);
  await prisma.workDay.create({
    data: { employeeId: emp.employeeId, date: new Date('2026-11-10T00:00:00Z'), status: DayStatus.COMPLETED },
  });
  tCeo = await login(ceo.email);
  tPm = await login(pm.email);
});

describe('management workday lookup', () => {
  it('the CEO finds a day with its segments by company date', async () => {
    const res = await request(app).get(`/api/v1/management/employees/${emp.employeeId}/workdays?date=2026-11-10`).set(auth(tCeo));
    expect(res.status).toBe(200);
    expect(res.body.data.workDay).toMatchObject({ status: DayStatus.COMPLETED });
    expect(Array.isArray(res.body.data.workDay.segments)).toBe(true);
  });

  it('returns null when the employee has no recorded day', async () => {
    const res = await request(app).get(`/api/v1/management/employees/${emp.employeeId}/workdays?date=2026-01-05`).set(auth(tCeo));
    expect(res.status).toBe(200);
    expect(res.body.data.workDay).toBeNull();
  });

  it('a PM sees only employees on projects they lead', async () => {
    const ok = await request(app).get(`/api/v1/management/employees/${emp.employeeId}/workdays?date=2026-11-10`).set(auth(tPm));
    expect(ok.status).toBe(200);
    const stranger = await createUser(Role.EMPLOYEE);
    const denied = await request(app).get(`/api/v1/management/employees/${stranger.employeeId}/workdays?date=2026-11-10`).set(auth(tPm));
    expect(denied.status).toBe(403);
  });

  it('rejects a bad date', async () => {
    const res = await request(app).get(`/api/v1/management/employees/${emp.employeeId}/workdays?date=10-11-2026`).set(auth(tCeo));
    expect(res.status).toBe(400);
  });
});

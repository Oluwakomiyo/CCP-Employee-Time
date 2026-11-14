import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role, DayStatus } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { app, auth, createProject, createUser, login, resetDb } from './helpers';

let tCeo: string;
let tEmp: string;
let empId: string;

beforeAll(async () => {
  await resetDb();
  const ceo = await createUser(Role.CEO_ADMIN);
  const emp = await createUser(Role.EMPLOYEE);
  empId = emp.employeeId;
  await createUser(Role.EMPLOYEE);
  [tCeo, tEmp] = await Promise.all([login(ceo.email), login(emp.email)]);
  await prisma.workDay.createMany({
    data: ['2026-11-02', '2026-11-03', '2026-11-04'].map((d) => ({
      employeeId: emp.employeeId,
      date: new Date(`${d}T00:00:00Z`),
      status: DayStatus.COMPLETED,
    })),
  });
});

describe('list endpoints (spec §59)', () => {
  it('sorts employees by an allowed field', async () => {
    const res = await request(app).get('/api/v1/employees?sort=employeeCode&order=asc').set(auth(tCeo));
    expect(res.status).toBe(200);
    const codes = res.body.data.map((e: { employeeCode: string }) => e.employeeCode);
    expect(codes).toEqual([...codes].sort());
    expect(res.body.meta).toMatchObject({ page: 1, total: 3 });
  });

  it('rejects sorting by a field outside the allow-list', async () => {
    expect((await request(app).get('/api/v1/employees?sort=passwordHash').set(auth(tCeo))).status).toBe(400);
  });

  it('pages time history newest first', async () => {
    const res = await request(app).get('/api/v1/me/time?limit=2&page=1').set(auth(tEmp));
    expect(res.status).toBe(200);
    expect(res.body.data.history.map((d: { date: string }) => d.date.slice(0, 10))).toEqual(['2026-11-04', '2026-11-03']);
    expect(res.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });

  it('caps page size', async () => {
    expect((await request(app).get('/api/v1/employees?limit=1000').set(auth(tCeo))).status).toBe(400);
  });

  it('project list carries net hours for management only', async () => {
    const proj = await createProject('HRS-1', [{ employeeId: empId }]);
    const day = await prisma.workDay.findFirstOrThrow({ where: { employeeId: empId } });
    await prisma.workSegment.create({
      data: {
        workDayId: day.id,
        projectId: proj.id,
        status: 'COMPLETED',
        clockIn: new Date('2026-11-02T08:00:00Z'),
        clockOut: new Date('2026-11-02T11:00:00Z'),
        durationSeconds: 3 * 3600,
      },
    });
    const ceoList = await request(app).get('/api/v1/projects').set(auth(tCeo));
    expect(ceoList.body.data.find((p: { code: string }) => p.code === 'HRS-1').hoursWorked).toBe(3);
    const empList = await request(app).get('/api/v1/projects').set(auth(tEmp));
    expect(empList.body.data.find((p: { code: string }) => p.code === 'HRS-1')).not.toHaveProperty('hoursWorked');
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role, DayStatus, SegmentStatus, PayrollStatus } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { app, auth, createProject, createUser, login, resetDb } from './helpers';

const H = 3600;
let tCeo: string;
let tPm: string;
let emp: Awaited<ReturnType<typeof createUser>>;
let project: { id: string };

const dayOf = (employeeId: string, date: string, netHours: number, status: DayStatus = DayStatus.COMPLETED) =>
  prisma.workDay.create({
    data: {
      employeeId,
      date: new Date(`${date}T00:00:00Z`),
      status,
      totalWorkSeconds: netHours * H,
      segments: {
        create: {
          projectId: project.id,
          status: SegmentStatus.COMPLETED,
          clockIn: new Date(`${date}T07:00:00Z`),
          clockOut: new Date(new Date(`${date}T07:00:00Z`).getTime() + netHours * H * 1000),
          durationSeconds: netHours * H,
        },
      },
    },
  });

const generate = (body: object) => request(app).post('/api/v1/payroll/generate').set(auth(tCeo)).send(body);
const finalize = (body: object) => request(app).post('/api/v1/payroll/finalize').set(auth(tCeo)).send(body);
const period = { periodStart: '2026-10-01', periodEnd: '2026-10-31' };

beforeAll(async () => {
  await resetDb();
  const ceo = await createUser(Role.CEO_ADMIN);
  const pm = await createUser(Role.PROJECT_MANAGER);
  emp = await createUser(Role.EMPLOYEE, { rate: 4000 }); // overtime 7500
  project = await createProject('PAY', [{ employeeId: emp.employeeId }]);
  [tCeo, tPm] = await Promise.all([login(ceo.email), login(pm.email)]);
  await dayOf(emp.employeeId, '2026-10-05', 8);
  await dayOf(emp.employeeId, '2026-10-06', 10); // 2h overtime
});

describe('payroll runs', () => {
  it('generates a draft with overtime split', async () => {
    const res = await generate(period);
    expect(res.status).toBe(201);
    const rec = await prisma.payrollRecord.findFirstOrThrow({ where: { employeeId: emp.employeeId } });
    expect(rec.status).toBe(PayrollStatus.DRAFT);
    expect(rec.regularHours.toNumber()).toBe(16);
    expect(rec.overtimeHours.toNumber()).toBe(2);
    expect(rec.grossPay.toNumber()).toBe(16 * 4000 + 2 * 7500);
  });

  it('refuses to finalize while a day in the period is unresolved', async () => {
    const flagged = await dayOf(emp.employeeId, '2026-10-07', 0, DayStatus.MISSING_CLOCK_OUT);
    const res = await finalize(period);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UNRESOLVED_DAYS');
    await prisma.workSegment.deleteMany({ where: { workDayId: flagged.id } });
    await prisma.workDay.delete({ where: { id: flagged.id } });
  });

  it('finalized runs are locked against regeneration', async () => {
    expect((await finalize(period)).status).toBe(200);
    await dayOf(emp.employeeId, '2026-10-08', 8); // late-arriving time
    const res = await generate(period);
    expect(res.status).toBe(201);
    expect(res.body.data.skippedFinalized).toBe(1);
    const rec = await prisma.payrollRecord.findFirstOrThrow({ where: { employeeId: emp.employeeId } });
    expect(rec.status).toBe(PayrollStatus.FINALIZED);
    expect(rec.grossPay.toNumber()).toBe(16 * 4000 + 2 * 7500);
  });

  it('rejects a period overlapping an existing one', async () => {
    const res = await generate({ periodStart: '2026-10-05', periodEnd: '2026-11-04' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OVERLAPPING_PERIOD');
  });

  it('exports CSV for the CEO only', async () => {
    const res = await request(app)
      .get('/api/v1/payroll/export?periodStart=2026-10-01&periodEnd=2026-10-31')
      .set(auth(tCeo));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const [header, row] = res.text.trim().split('\n');
    expect(header).toBe('employeeCode,firstName,lastName,department,periodStart,periodEnd,regularHours,overtimeHours,grossPay,currency,status');
    expect(row).toContain('79000.00');
    expect(row).toContain('FINALIZED');
    expect((await request(app).get('/api/v1/payroll/export?periodStart=2026-10-01&periodEnd=2026-10-31').set(auth(tPm))).status).toBe(403);
  });

  it('validates periods', async () => {
    expect((await generate({ periodStart: '2026-10-31', periodEnd: '2026-10-01' })).status).toBe(400);
    expect((await generate({ periodStart: '2026-01-01', periodEnd: '2026-12-31' })).status).toBe(400);
  });
});

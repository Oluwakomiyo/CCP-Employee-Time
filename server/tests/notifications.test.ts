import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role, DayStatus } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { app, auth, createProject, createUser, login, resetDb } from './helpers';

let ceo: Awaited<ReturnType<typeof createUser>>;
let pm: Awaited<ReturnType<typeof createUser>>;
let otherPm: Awaited<ReturnType<typeof createUser>>;
let emp: Awaited<ReturnType<typeof createUser>>;
let proj: { id: string };
let tCeo: string;
let tPm: string;
let tEmp: string;

const inbox = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

beforeAll(async () => {
  await resetDb();
  ceo = await createUser(Role.CEO_ADMIN);
  pm = await createUser(Role.PROJECT_MANAGER);
  otherPm = await createUser(Role.PROJECT_MANAGER);
  emp = await createUser(Role.EMPLOYEE);
  proj = await createProject('NTF-1', [{ employeeId: pm.employeeId, lead: true }, { employeeId: emp.employeeId }]);
  tCeo = await login(ceo.email);
  tPm = await login(pm.email);
  tEmp = await login(emp.email);
});

describe('notifications', () => {
  it('a correction notifies the CEO and the lead PM (not other PMs), then the employee on review', async () => {
    const day = await prisma.workDay.create({
      data: { employeeId: emp.employeeId, date: new Date('2026-11-10T00:00:00Z'), status: DayStatus.COMPLETED },
    });
    const sub = await request(app)
      .post('/api/v1/corrections')
      .set(auth(tEmp))
      .send({
        workDayId: day.id,
        reason: 'Forgot to clock in',
        requestedChanges: { projectId: proj.id, proposedClockIn: '2026-11-10T08:00:00Z', proposedClockOut: '2026-11-10T12:00:00Z' },
      });
    expect(sub.status).toBe(201);

    expect((await inbox(ceo.userId)).map((n) => n.type)).toEqual(['CORRECTION_SUBMITTED']);
    expect((await inbox(pm.userId)).map((n) => n.type)).toEqual(['CORRECTION_SUBMITTED']);
    expect(await inbox(otherPm.userId)).toHaveLength(0);
    expect(await inbox(emp.userId)).toHaveLength(0);

    const rev = await request(app).patch(`/api/v1/corrections/${sub.body.data.correction.id}/review`).set(auth(tPm)).send({ status: 'APPROVED' });
    expect(rev.status).toBe(200);
    const mine = await inbox(emp.userId);
    expect(mine.map((n) => n.type)).toEqual(['CORRECTION_APPROVED']);
    expect(JSON.stringify(mine[0].data)).not.toMatch(/rate|pay/i);
  });

  it('project assignment notifies the employee', async () => {
    const newcomer = await createUser(Role.EMPLOYEE);
    const res = await request(app).post(`/api/v1/projects/${proj.id}/members`).set(auth(tCeo)).send({ employeeId: newcomer.employeeId });
    expect(res.status).toBe(201);
    expect((await inbox(newcomer.userId)).map((n) => n.type)).toEqual(['PROJECT_ASSIGNED']);
  });

  it('the inbox is per user: list, unread count, mark read, read all', async () => {
    const list = await request(app).get('/api/v1/me/notifications').set(auth(tEmp));
    expect(list.status).toBe(200);
    expect(list.body.meta.unread).toBe(1);
    const id = list.body.data[0].id;

    // Someone else's notification looks missing.
    expect((await request(app).post(`/api/v1/me/notifications/${id}/read`).set(auth(tPm))).status).toBe(404);

    expect((await request(app).post(`/api/v1/me/notifications/${id}/read`).set(auth(tEmp))).status).toBe(200);
    // Marking again is harmless.
    expect((await request(app).post(`/api/v1/me/notifications/${id}/read`).set(auth(tEmp))).status).toBe(200);
    const after = await request(app).get('/api/v1/me/notifications?unread=true').set(auth(tEmp));
    expect(after.body.data).toHaveLength(0);
    expect(after.body.meta.unread).toBe(0);

    const all = await request(app).post('/api/v1/me/notifications/read-all').set(auth(tCeo));
    expect(all.body.data.updated).toBeGreaterThanOrEqual(1);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { app, auth, createUser, login, resetDb } from './helpers';

let tCeo: string;
let tPm: string;
let empId: string;

beforeAll(async () => {
  await resetDb();
  const ceo = await createUser(Role.CEO_ADMIN);
  const pm = await createUser(Role.PROJECT_MANAGER);
  const emp = await createUser(Role.EMPLOYEE);
  empId = emp.employeeId;
  tCeo = await login(ceo.email);
  tPm = await login(pm.email);
});

describe('devices (settings)', () => {
  it('CEO lists devices without key hashes; revoking stops the agent key working', async () => {
    const reg = await request(app)
      .post('/api/v1/activity/devices')
      .set(auth(tCeo))
      .send({ employeeId: empId, deviceName: 'Studio PC', deviceIdentifier: 'HW-TEST-01', platform: 'Windows 11' });
    expect(reg.status).toBe(201);
    const apiKey = reg.body.data.apiKey;
    const deviceId = reg.body.data.device.id;

    const list = await request(app).get('/api/v1/activity/devices').set(auth(tCeo));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toMatch(/apiKeyHash/);

    expect((await request(app).get('/api/v1/activity/devices').set(auth(tPm))).status).toBe(403);
    expect((await request(app).post(`/api/v1/activity/devices/${deviceId}/revoke`).set(auth(tPm))).status).toBe(403);

    const revoke = await request(app).post(`/api/v1/activity/devices/${deviceId}/revoke`).set(auth(tCeo));
    expect(revoke.status).toBe(200);
    expect(revoke.body.data.isActive).toBe(false);

    const beat = await request(app)
      .post('/api/v1/activity/agent-heartbeat')
      .set('x-device-key', apiKey)
      .send({ deviceIdentifier: 'HW-TEST-01', idleSeconds: 0 });
    expect(beat.status).toBe(403);
  });
});

describe('self-enrollment (desktop app)', () => {
  const id = 'a'.repeat(64); // sha256 of the machine id, as the app sends it
  const beat = (key: string) =>
    request(app).post('/api/v1/activity/agent-heartbeat').set('x-device-key', key).send({ deviceIdentifier: id, idleSeconds: 0 });

  it('an employee enrolls their computer, re-enrolling reissues the key, others are refused', async () => {
    const emp = await createUser(Role.EMPLOYEE);
    const other = await createUser(Role.EMPLOYEE);
    const t = await login(emp.email);

    const first = await request(app).post('/api/v1/activity/devices/enroll').set(auth(t)).send({ deviceIdentifier: id, deviceName: 'JOHN-LAPTOP', platform: 'Windows' });
    expect(first.status).toBe(201);
    expect((await beat(first.body.data.apiKey)).status).toBe(200);

    const again = await request(app).post('/api/v1/activity/devices/enroll').set(auth(t)).send({ deviceIdentifier: id, deviceName: 'JOHN-LAPTOP', platform: 'Windows' });
    expect(again.status).toBe(201);
    expect((await beat(first.body.data.apiKey)).status).toBe(403); // old key replaced
    expect((await beat(again.body.data.apiKey)).status).toBe(200);

    const list = await request(app).get('/api/v1/activity/devices').set(auth(tCeo));
    expect(list.body.data.find((d: { deviceIdentifier: string }) => d.deviceIdentifier === id).enrolledBy).toBe('SELF');

    const taken = await request(app).post('/api/v1/activity/devices/enroll').set(auth(await login(other.email))).send({ deviceIdentifier: id, deviceName: 'X', platform: 'Windows' });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('DEVICE_OWNED');
  });

  it('a revoked computer cannot re-enroll until an admin reinstates it; every step is audited', async () => {
    const emp = await createUser(Role.EMPLOYEE);
    const t = await login(emp.email);
    const ident = 'b'.repeat(64);
    const enroll = () => request(app).post('/api/v1/activity/devices/enroll').set(auth(t)).send({ deviceIdentifier: ident, deviceName: 'PC', platform: 'macOS' });
    const deviceId = (await enroll()).body.data.device.id;

    await request(app).post(`/api/v1/activity/devices/${deviceId}/revoke`).set(auth(tCeo));
    const refused = await enroll();
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('DEVICE_REVOKED');

    expect((await request(app).post(`/api/v1/activity/devices/${deviceId}/reinstate`).set(auth(tPm))).status).toBe(403);
    expect((await request(app).post(`/api/v1/activity/devices/${deviceId}/reinstate`).set(auth(tCeo))).status).toBe(200);
    expect((await enroll()).status).toBe(201);

    const events = (await prisma.auditLog.findMany({ where: { entityId: deviceId } })).map((l) => (l.afterState as { event: string }).event);
    expect(events).toEqual(expect.arrayContaining(['DEVICE_ENROLLED', 'DEVICE_REVOKED', 'DEVICE_REINSTATED', 'DEVICE_KEY_REISSUED']));
  });

  it('needs time.track: a role without it cannot enroll', async () => {
    const created = await request(app).post('/api/v1/roles').set(auth(tCeo)).send({ name: 'Viewer', permissions: { 'reports.view': 'ALL' } });
    const u = await createUser(Role.EMPLOYEE);
    await request(app).put(`/api/v1/roles/assign/${u.employeeId}`).set(auth(tCeo)).send({ roleId: created.body.data.id });
    const res = await request(app).post('/api/v1/activity/devices/enroll').set(auth(await login(u.email))).send({ deviceIdentifier: 'c'.repeat(64), deviceName: 'PC', platform: 'Linux' });
    expect(res.status).toBe(403);
  });
});

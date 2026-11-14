import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
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

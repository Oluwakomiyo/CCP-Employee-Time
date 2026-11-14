import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role, DayStatus, HeartbeatSource, SessionStatus } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { app, auth, createUser, login, resetDb } from './helpers';

let tCeo: string;
let emp: Awaited<ReturnType<typeof createUser>>;
let deviceId: string;

const makeDay = (date: string) =>
  prisma.workDay.create({
    data: { employeeId: emp.employeeId, date: new Date(`${date}T00:00:00Z`), status: DayStatus.COMPLETED },
  });

const beat = (
  workDayId: string,
  at: string,
  source: HeartbeatSource,
  extra: { deviceId?: string; idleSeconds?: number; sessionStatus?: SessionStatus } = {}
) =>
  prisma.activityHeartbeat.create({
    data: {
      employeeId: emp.employeeId,
      workDayId,
      source,
      receivedAt: new Date(at),
      sessionStatus: extra.sessionStatus ?? SessionStatus.ACTIVE,
      idleSeconds: extra.idleSeconds ?? 10,
      ...(extra.deviceId ? { deviceId: extra.deviceId } : {}),
    },
  });

const evidence = (workDayId: string) =>
  request(app).get(`/api/v1/activity/workdays/${workDayId}/evidence`).set(auth(tCeo));

beforeAll(async () => {
  await resetDb();
  const ceo = await createUser(Role.CEO_ADMIN);
  emp = await createUser(Role.EMPLOYEE);
  const device = await prisma.employeeDevice.create({
    data: { employeeId: emp.employeeId, deviceName: 'Test Rig', deviceIdentifier: 'HW-TEST-01', platform: 'Linux', apiKeyHash: 'x'.repeat(64) },
  });
  deviceId = device.id;
  tCeo = await login(ceo.email);
});

describe('work evidence telemetry', () => {
  it('de-duplicates per device per minute and prefers the agent source', async () => {
    const day = await makeDay('2026-11-10');
    // Two agent signals in the same minute collapse to one; an UNKNOWN agent
    // signal in its own minute survives dedupe but never counts as active;
    // browser signals lose to the agent.
    await beat(day.id, '2026-11-10T08:00:30Z', HeartbeatSource.DESKTOP_AGENT, { deviceId });
    await beat(day.id, '2026-11-10T08:00:50Z', HeartbeatSource.DESKTOP_AGENT, { deviceId });
    await beat(day.id, '2026-11-10T08:01:10Z', HeartbeatSource.DESKTOP_AGENT, { deviceId });
    await beat(day.id, '2026-11-10T08:02:10Z', HeartbeatSource.DESKTOP_AGENT, { deviceId, sessionStatus: SessionStatus.UNKNOWN });
    await beat(day.id, '2026-11-10T08:00:35Z', HeartbeatSource.BROWSER);
    await beat(day.id, '2026-11-10T08:01:20Z', HeartbeatSource.BROWSER);

    const res = await evidence(day.id);
    expect(res.status).toBe(200);
    // 3 agent minutes + 2 browser minutes, deduped; active time from the agent only.
    expect(res.body.data.activityEvidence.heartbeatCount).toBe(5);
    expect(res.body.data.activityEvidence.detectedActiveSeconds).toBe(120);
    expect(res.body.data.activityEvidence.registeredDevicesSeen).toEqual(['Test Rig (Linux)']);
    expect(res.body.data.activityEvidence.isDeviceAgentOnline).toBe(false);
  });

  it('falls back to browser signals when the agent never reported', async () => {
    const day = await makeDay('2026-11-11');
    await beat(day.id, '2026-11-11T09:00:10Z', HeartbeatSource.BROWSER);
    await beat(day.id, '2026-11-11T09:00:40Z', HeartbeatSource.BROWSER);

    const res = await evidence(day.id);
    expect(res.status).toBe(200);
    expect(res.body.data.activityEvidence.heartbeatCount).toBe(1);
    expect(res.body.data.activityEvidence.detectedActiveSeconds).toBe(60);
  });
});

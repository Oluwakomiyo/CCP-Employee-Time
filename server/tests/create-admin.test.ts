import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/config/prisma';
import { createFirstAdmin } from '../src/scripts/create-admin';
import { app, resetDb } from './helpers';

beforeAll(async () => {
  await resetDb();
});

describe('create-admin (first CEO on an empty database)', () => {
  it('creates a CEO who must change the temporary password, then refuses a second run', async () => {
    const r = await createFirstAdmin(prisma, { email: 'Boss@Company.ng', firstName: 'Ada', lastName: 'Okafor' });
    expect(r.email).toBe('boss@company.ng');

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'boss@company.ng' }, include: { employee: true, appRole: true } });
    expect(user.appRole.key).toBe('ceo_admin');
    expect(user.mustChangePassword).toBe(true);
    expect(user.employee?.department).toBe('Executive');

    const login = await request(app).post('/api/v1/auth/login').send({ email: 'boss@company.ng', password: r.temporaryPassword });
    expect(login.status).toBe(200);
    expect(login.body.data.user.mustChangePassword).toBe(true);

    await expect(createFirstAdmin(prisma, { email: 'other@company.ng', firstName: 'B', lastName: 'C' })).rejects.toThrow(/already exists/);
  });

  it('rejects a missing email', async () => {
    await expect(createFirstAdmin(prisma, { email: '', firstName: 'A', lastName: 'B' })).rejects.toThrow();
  });
});

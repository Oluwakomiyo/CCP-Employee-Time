import { ensureSystemRoles, systemRoleKey } from '../src/auth/permissions';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Role } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { createApp } from '../src/app';

export const app = createApp();
export const PASSWORD = 'Test-password-123';

/** Empties every table (TRUNCATE bypasses the append-only AuditLog trigger). */
export const resetDb = async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
};

let seq = 0;
export const createUser = async (role: Role, opts: { mustChangePassword?: boolean; rate?: number } = {}) => {
  seq += 1;
  await prisma.department.upsert({ where: { name: 'Design' }, create: { name: 'Design' }, update: {} });
  await prisma.position.upsert({ where: { name: 'Architect' }, create: { name: 'Architect' }, update: {} });
  await ensureSystemRoles(prisma);
  const user = await prisma.user.create({
    data: {
      email: `user${seq}@test.local`,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      appRole: { connect: { key: systemRoleKey(role) } },
      mustChangePassword: opts.mustChangePassword ?? false,
      employee: {
        create: {
          employeeCode: `EMP-${seq}`,
          firstName: `First${seq}`,
          lastName: `Last${seq}`,
          department: 'Design',
          position: 'Architect',
          hireDate: new Date('2026-01-01'),
          compensations: {
            create: {
              baseHourlyRate: opts.rate ?? 5000,
              overtimeHourlyRate: 7500,
              currency: 'NGN',
              effectiveFrom: new Date('2026-01-01'),
            },
          },
        },
      },
    },
    include: { employee: true },
  });
  return { userId: user.id, employeeId: user.employee!.id, email: user.email };
};

export const createProject = async (code: string, members: { employeeId: string; lead?: boolean }[]) =>
  prisma.project.create({
    data: {
      code,
      name: `Project ${code}`,
      startDate: new Date('2026-01-01'),
      members: { create: members.map((m) => ({ employeeId: m.employeeId, isProjectLead: m.lead ?? false })) },
    },
  });

/** Logs in and returns a bearer token, read from the session cookie (tokens never appear in bodies). */
export const login = async (email: string, password = PASSWORD) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const cookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const access = cookies
    .find((c) => c.startsWith('ccp_at='))
    ?.split(';')[0]
    ?.slice('ccp_at='.length);
  if (!access) throw new Error(`no session cookie for ${email}`);
  return access;
};

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

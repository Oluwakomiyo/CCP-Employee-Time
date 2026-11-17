/**
 * Creates the first CEO account on an empty production database (the demo seed must never run there).
 *
 *   Dev:        npx tsx src/scripts/create-admin.ts --email ceo@company.ng --first Ada --last Okafor
 *   Production: node dist/scripts/create-admin.js --email ceo@company.ng --first Ada --last Okafor
 *
 * Prints a temporary password once; the CEO must change it at first sign-in. Refuses to run when a
 * CEO already exists: from then on, people are added from the Employees screen.
 */
import bcrypt from 'bcryptjs';
import { AuditAction, EmploymentStatus, Role } from '@prisma/client';
import { z } from 'zod';
import type { DbClient } from '../config/prisma';
import { generateTemporaryPassword } from '../utils/password';
import { workDateFor } from '../utils/time';

export const adminInputSchema = z.object({
  email: z.string().email('A valid --email is required').trim().toLowerCase(),
  firstName: z.string().trim().min(1, '--first is required'),
  lastName: z.string().trim().min(1, '--last is required'),
  employeeCode: z.string().trim().min(3).toUpperCase().default('EMP-001'),
  department: z.string().trim().min(2).default('Executive'),
  position: z.string().trim().min(2).default('Chief Executive Officer'),
});
export type AdminInput = z.input<typeof adminInputSchema>;

export async function createFirstAdmin(db: DbClient & { $transaction: <T>(fn: (tx: DbClient) => Promise<T>) => Promise<T> }, raw: AdminInput) {
  const input = adminInputSchema.parse(raw);
  if (await db.user.count({ where: { role: Role.CEO_ADMIN } })) {
    throw new Error('A CEO account already exists. Add people from the Employees screen instead.');
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const employee = await db.$transaction(async (tx) => {
    await tx.department.upsert({ where: { name: input.department }, create: { name: input.department }, update: {} });
    await tx.position.upsert({ where: { name: input.position }, create: { name: input.position }, update: {} });
    const user = await tx.user.create({
      data: { email: input.email, passwordHash, role: Role.CEO_ADMIN, mustChangePassword: true },
    });
    const created = await tx.employee.create({
      data: {
        userId: user.id,
        employeeCode: input.employeeCode,
        firstName: input.firstName,
        lastName: input.lastName,
        department: input.department,
        position: input.position,
        status: EmploymentStatus.ACTIVE,
        hireDate: workDateFor(new Date()),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: AuditAction.CREATE,
        entityName: 'Employee',
        entityId: created.id,
        afterState: { event: 'FIRST_ADMIN_CREATED', employeeCode: created.employeeCode, email: user.email, role: user.role },
      },
    });
    return created;
  });

  return { employeeId: employee.id, email: input.email, temporaryPassword };
}

/** `--email a@b.c --first Ada` → { email, first }. */
const parseArgs = (argv: string[]) => {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (key && argv[i + 1] !== undefined) out[key] = argv[i + 1];
  }
  return out;
};

if (require.main === module) {
  // Loaded lazily so importing this file (tests) doesn't need the env or a connection.
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('dotenv').config();
  const { prisma } = require('../config/prisma') as typeof import('../config/prisma');
  const a = parseArgs(process.argv.slice(2));
  createFirstAdmin(prisma, {
    email: a.email ?? '',
    firstName: a.first ?? '',
    lastName: a.last ?? '',
    employeeCode: a.code,
    department: a.department,
    position: a.position,
  })
    .then((r) => {
      console.log(`\nCEO account created for ${r.email}`);
      console.log(`Temporary password (shown once): ${r.temporaryPassword}`);
      console.log('Sign in with it; you will be asked to choose your own password.\n');
    })
    .catch((e: unknown) => {
      console.error(`\nCould not create the CEO account: ${e instanceof z.ZodError ? e.issues.map((i) => i.message).join('; ') : (e as Error).message}\n`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

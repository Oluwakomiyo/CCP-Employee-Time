import { PrismaClient } from '@prisma/client';

/** Keys that must never be written into audit before/after snapshots. */
const SECRET_KEYS = new Set(['passwordHash', 'managedPassword', 'refreshTokenHash', 'apiKeyHash']);

export const stripSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripSecrets);
  // Dates and Prisma Decimals serialize themselves; keep their JSON form.
  if (value && typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    return (value as { toJSON: () => unknown }).toJSON();
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SECRET_KEYS.has(key))
        .map(([key, v]) => [key, stripSecrets(v)])
    );
  }
  return value;
};

const createClient = () =>
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  }).$extends({
    // Every audit write, wherever it comes from, is scrubbed of credential fields.
    query: {
      auditLog: {
        async create({ args, query }) {
          const data = args.data as Record<string, unknown>;
          if (data.beforeState !== undefined) data.beforeState = stripSecrets(data.beforeState);
          if (data.afterState !== undefined) data.afterState = stripSecrets(data.afterState);
          return query(args);
        },
      },
    },
  });

type ExtendedClient = ReturnType<typeof createClient>;
const globalForPrisma = global as unknown as { prisma?: ExtendedClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** The extended client or a transaction client from it: use for helpers that run inside or outside a transaction. */
export type DbClient = Omit<typeof prisma, '$transaction' | '$connect' | '$disconnect' | '$on' | '$extends' | '$use'>;

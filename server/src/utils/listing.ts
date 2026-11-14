import { z } from 'zod';

/** `?sort=<field>&order=asc|desc` restricted to an allow-list of fields (spec §59). */
export const sortQuery = <T extends readonly [string, ...string[]]>(fields: T, defaultField: T[number], defaultOrder: 'asc' | 'desc' = 'desc') => ({
  sort: z.enum(fields).default(defaultField as never),
  order: z.enum(['asc', 'desc']).default(defaultOrder),
});

/** `?page=&limit=` with a hard cap so nobody pulls thousands of rows (spec §59). */
export const pageQuery = (defaultLimit = 20, maxLimit = 100) => ({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(maxLimit).default(defaultLimit),
});

export const pageMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

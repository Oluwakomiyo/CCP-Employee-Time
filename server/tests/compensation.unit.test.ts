import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { rateOn, dayBefore } from '../src/modules/employees/compensation';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const row = (base: number, from: string, to: string | null) => ({
  baseHourlyRate: new Prisma.Decimal(base),
  overtimeHourlyRate: new Prisma.Decimal(base * 1.5),
  currency: 'NGN',
  effectiveFrom: d(from),
  effectiveTo: to ? d(to) : null,
});

describe('rateOn (spec §20 example)', () => {
  const rows = [row(4000, '2026-01-01', '2026-06-30'), row(5000, '2026-07-01', null)];

  it('picks the rate in force on each day, inclusive of both ends', () => {
    expect(rateOn(rows, d('2026-01-01'))?.baseHourlyRate.toNumber()).toBe(4000);
    expect(rateOn(rows, d('2026-06-30'))?.baseHourlyRate.toNumber()).toBe(4000);
    expect(rateOn(rows, d('2026-07-01'))?.baseHourlyRate.toNumber()).toBe(5000);
    expect(rateOn(rows, d('2027-03-15'))?.baseHourlyRate.toNumber()).toBe(5000);
  });

  it('returns null before the first rate', () => {
    expect(rateOn(rows, d('2025-12-31'))).toBeNull();
  });

  it('dayBefore closes the previous period', () => {
    expect(dayBefore(d('2026-07-01')).toISOString().slice(0, 10)).toBe('2026-06-30');
  });
});

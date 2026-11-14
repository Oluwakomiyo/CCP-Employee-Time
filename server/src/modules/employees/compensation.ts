import { Prisma } from '@prisma/client';

export interface RateRow {
  baseHourlyRate: Prisma.Decimal;
  overtimeHourlyRate: Prisma.Decimal;
  currency: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/** Rows that are still in force (no end date). */
export const CURRENT_RATE = { effectiveTo: null } as const;

/**
 * The rate that applied on a calendar date (UTC-midnight Date, as stored for @db.Date).
 * Rows are inclusive on both ends; returns null if no rate covered that day.
 */
export const rateOn = <T extends RateRow>(rows: T[], day: Date): T | null =>
  rows.find((r) => r.effectiveFrom <= day && (r.effectiveTo === null || r.effectiveTo >= day)) ?? null;

/** The day before a YYYY-MM-DD date, used to close the previous rate. */
export const dayBefore = (date: Date) => new Date(date.getTime() - 24 * 60 * 60 * 1000);

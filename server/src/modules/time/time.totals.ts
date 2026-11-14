import { prisma, DbClient } from '../../config/prisma';

/**
 * Runs fn in a transaction that first takes a per-employee advisory lock, so two clicks
 * (or two tabs) on any time action for the same employee are processed one after another (spec §42).
 */
export const withEmployeeLock = <T>(employeeId: string, fn: (tx: DbClient) => Promise<T>) =>
  prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${employeeId}))::text`;
    return fn(tx);
  });

export const secondsBetween = (from: Date, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));

/**
 * Recomputes a workday's totals from its source records (spec §30, §77):
 * - totalWorkSeconds  = sum of closed segment durations (presence, breaks included)
 * - totalBreakSeconds = sum of closed break durations
 * Net working time = totalWorkSeconds - totalBreakSeconds. Open or unresolved segments count as 0.
 */
export const recomputeDayTotals = async (tx: DbClient, workDayId: string) => {
  const [segments, breaks] = await Promise.all([
    tx.workSegment.aggregate({
      where: { workDayId, durationSeconds: { not: null } },
      _sum: { durationSeconds: true },
    }),
    tx.break.aggregate({
      where: { workSegment: { workDayId }, durationSeconds: { not: null } },
      _sum: { durationSeconds: true },
    }),
  ]);
  const totals = {
    totalWorkSeconds: segments._sum.durationSeconds ?? 0,
    totalBreakSeconds: breaks._sum.durationSeconds ?? 0,
  };
  await tx.workDay.update({ where: { id: workDayId }, data: totals });
  return totals;
};

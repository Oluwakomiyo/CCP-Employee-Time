/**
 * Pure aggregation over source records (spec §30, §77): nothing here reads stored totals.
 * Working time of a segment = its duration minus the breaks recorded inside it.
 * A segment still running is measured up to `now`; unresolved missing clock-outs count as 0.
 */

export interface BreakLike {
  startTime: Date;
  endTime: Date | null;
}
export interface ActivityLike {
  activityType: string;
  startTime: Date;
  endTime: Date | null;
}
export interface SegmentLike {
  projectId: string;
  location: string;
  status: string;
  clockIn: Date;
  clockOut: Date | null;
  durationSeconds: number | null;
  breaks: BreakLike[];
  activities: ActivityLike[];
}

const sec = (ms: number) => Math.max(0, Math.floor(ms / 1000));

/** Effective end of a segment: its clock-out, `now` if running, null if unresolved. */
export const segmentEnd = (s: SegmentLike, now: Date): Date | null =>
  s.clockOut ?? (s.status === 'ACTIVE' ? now : null);

/** Seconds of [a1,a2) that overlap [b1,b2). */
const overlap = (a1: Date, a2: Date, b1: Date, b2: Date) =>
  sec(Math.min(a2.getTime(), b2.getTime()) - Math.max(a1.getTime(), b1.getTime()));

export const breakSeconds = (s: SegmentLike, now: Date) => {
  const end = segmentEnd(s, now);
  if (!end) return 0;
  return s.breaks.reduce((sum, b) => sum + overlap(b.startTime, b.endTime ?? now, s.clockIn, end), 0);
};

export const presenceSeconds = (s: SegmentLike, now: Date) => {
  const end = segmentEnd(s, now);
  return end ? sec(end.getTime() - s.clockIn.getTime()) : 0;
};

export const netSeconds = (s: SegmentLike, now: Date) => Math.max(0, presenceSeconds(s, now) - breakSeconds(s, now));

/** Net seconds per activity type within a segment (activity time minus overlapping breaks). */
export const activitySeconds = (s: SegmentLike, now: Date): Map<string, number> => {
  const out = new Map<string, number>();
  const end = segmentEnd(s, now);
  if (!end) return out;
  for (const a of s.activities) {
    const aEnd = a.endTime ?? end;
    const gross = overlap(a.startTime, aEnd, s.clockIn, end);
    const inBreaks = s.breaks.reduce((sum, b) => sum + overlap(a.startTime, aEnd, b.startTime, b.endTime ?? now), 0);
    out.set(a.activityType, (out.get(a.activityType) ?? 0) + Math.max(0, gross - inBreaks));
  }
  return out;
};

/** Adds `value` to `key` in a map. */
export const bump = <K>(m: Map<K, number>, key: K, value: number) => m.set(key, (m.get(key) ?? 0) + value);

/** Seconds to hours with 2 decimals. */
export const hours = (seconds: number) => Math.round((seconds / 3600) * 100) / 100;

/** Map of seconds to a sorted [{ key, hours }] list, largest first. */
export const toHoursList = <K extends string>(m: Map<K, number>, keyName = 'key') =>
  [...m.entries()].map(([k, s]) => ({ [keyName]: k, hours: hours(s) })).sort((a, b) => b.hours - a.hours);

import { describe, expect, it } from 'vitest';
import { netSeconds, breakSeconds, activitySeconds, presenceSeconds, SegmentLike } from '../src/modules/reports/aggregate';

const t = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00Z`);
const H = 3600;
const now = t('18:00');

// §31: 11:00-14:00 at ABC on site, lunch 13:00-14:00 inside it.
const site: SegmentLike = {
  projectId: 'abc',
  location: 'SITE',
  status: 'COMPLETED',
  clockIn: t('11:00'),
  clockOut: t('14:00'),
  durationSeconds: 3 * H,
  breaks: [{ startTime: t('13:00'), endTime: t('14:00') }],
  activities: [
    { activityType: 'DESIGN', startTime: t('11:00'), endTime: t('12:00') },
    { activityType: 'SITE_INSPECTION', startTime: t('12:00'), endTime: null },
  ],
};

describe('report aggregation', () => {
  it('nets breaks out of a segment', () => {
    expect(presenceSeconds(site, now)).toBe(3 * H);
    expect(breakSeconds(site, now)).toBe(1 * H);
    expect(netSeconds(site, now)).toBe(2 * H);
  });

  it('nets breaks out of the activity they overlap', () => {
    const a = activitySeconds(site, now);
    expect(a.get('DESIGN')).toBe(1 * H);
    expect(a.get('SITE_INSPECTION')).toBe(1 * H); // 12:00-14:00 minus lunch
  });

  it('measures a running segment and a running break up to now', () => {
    const running: SegmentLike = {
      ...site,
      status: 'ACTIVE',
      clockOut: null,
      durationSeconds: null,
      breaks: [{ startTime: t('17:30'), endTime: null }],
      activities: [{ activityType: 'DESIGN', startTime: t('11:00'), endTime: null }],
    };
    expect(presenceSeconds(running, now)).toBe(7 * H);
    expect(netSeconds(running, now)).toBe(6.5 * H);
  });

  it('counts an unresolved missing clock-out as zero', () => {
    const missing: SegmentLike = { ...site, status: 'AUTO_CLOSED', clockOut: null, durationSeconds: null };
    expect(netSeconds(missing, now)).toBe(0);
    expect(activitySeconds(missing, now).size).toBe(0);
  });
});

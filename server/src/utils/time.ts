/** Company timezone (spec §54). Timestamps are stored in UTC; the workday is the local date at clock-in. */
export const companyTz = () => process.env.COMPANY_TZ || 'Africa/Lagos';

/** Returns the company-local calendar date of an instant as a UTC-midnight Date (Prisma @db.Date). */
export const workDateFor = (instant: Date): Date => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: companyTz(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant); // en-CA formats as YYYY-MM-DD
  return new Date(`${parts}T00:00:00.000Z`);
};

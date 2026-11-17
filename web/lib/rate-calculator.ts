/**
 * Work-rate calculator: exact maths for "what does this budget buy?" and "what will this cost?".
 * Reference figures only (headcount and rates typed in), never real people or stored data.
 * Money is in naira. Overtime follows payroll: hours above 8 a day are paid at the overtime multiplier.
 */

export interface TeamLine {
  id: string;
  label: string;
  count: number;
  /** ₦ per hour, per person */
  rate: number;
}

export type CalcMode = "budget" | "cost";

export interface CalcInput {
  mode: CalcMode;
  /** ₦ allocated to the project */
  budget: number;
  team: TeamLine[];
  hoursPerDay: number;
  daysPerWeek: number;
  /** Share of the budget held back for surprises, 0-50 */
  contingencyPct: number;
  overtimeMultiplier: number;
  /** YYYY-MM-DD, optional: gives an end date */
  startDate: string | null;
  /** "cost" mode: how many working days the work runs */
  workingDays: number;
}

export interface CalcResult {
  people: number;
  /** ₦ per hour for the whole team at regular rates */
  teamHourly: number;
  costPerDay: number;
  /** person-hours worked per day by the whole team */
  personHoursPerDay: number;
  workingDays: number;
  weeks: number;
  personHours: number;
  endDate: string | null;
  /** Money for the work itself (excludes the reserve) */
  workCost: number;
  /** Money held back (contingency) */
  reserve: number;
  /** budget - (work + reserve); negative = shortfall. "budget" mode: 0 by construction, minus rounding. */
  remaining: number;
  /** "cost" mode: the budget this needs, reserve included */
  budgetNeeded: number;
}

export const STANDARD_DAY_HOURS = 8;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Weekdays that count as working days, Monday first: 5 = Mon-Fri, 6 = Mon-Sat, 7 = every day. */
const isWorkingDay = (d: Date, daysPerWeek: number) => {
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return dow < daysPerWeek;
};

/** The date of the n-th working day counting the start (if it is one) as day 1. */
export function addWorkingDays(start: string, n: number, daysPerWeek: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  let counted = 0;
  for (let guard = 0; guard < 20000; guard++) {
    if (isWorkingDay(d, daysPerWeek) && ++counted >= n) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/** Valid when there is someone on the team and a positive day; the budget only matters in budget mode. */
export const isCalculable = (i: CalcInput) =>
  i.team.some((t) => t.count > 0 && t.rate > 0) &&
  i.hoursPerDay > 0 &&
  i.hoursPerDay <= 24 &&
  i.daysPerWeek >= 1 &&
  i.daysPerWeek <= 7 &&
  i.contingencyPct >= 0 &&
  i.contingencyPct < 100 &&
  (i.mode === "budget" ? i.budget > 0 : i.workingDays > 0);

export function calculate(i: CalcInput): CalcResult | null {
  if (!isCalculable(i)) return null;
  const lines = i.team.filter((t) => t.count > 0 && t.rate > 0);
  const people = lines.reduce((a, t) => a + t.count, 0);
  const teamHourly = lines.reduce((a, t) => a + t.count * t.rate, 0);
  const regular = Math.min(i.hoursPerDay, STANDARD_DAY_HOURS);
  const overtime = Math.max(0, i.hoursPerDay - STANDARD_DAY_HOURS);
  const costPerDay = teamHourly * regular + teamHourly * overtime * i.overtimeMultiplier;
  const keep = 1 - i.contingencyPct / 100;

  let workingDays: number;
  let workCost: number;
  let budgetNeeded: number;
  if (i.mode === "budget") {
    workCost = i.budget * keep;
    workingDays = workCost / costPerDay;
    budgetNeeded = i.budget;
  } else {
    workingDays = i.workingDays;
    workCost = costPerDay * workingDays;
    // The reserve is the same share of the budget as in budget mode, so the two modes agree.
    budgetNeeded = workCost / keep;
  }
  const reserve = budgetNeeded - workCost;
  const remaining = i.mode === "budget" ? 0 : i.budget - budgetNeeded;

  return {
    people,
    teamHourly: round2(teamHourly),
    costPerDay: round2(costPerDay),
    personHoursPerDay: round2(people * i.hoursPerDay),
    workingDays: round1(workingDays),
    weeks: round1(workingDays / i.daysPerWeek),
    personHours: Math.round(workingDays * people * i.hoursPerDay),
    endDate: i.startDate && workingDays >= 1 ? addWorkingDays(i.startDate, Math.ceil(workingDays - 1e-9), i.daysPerWeek) : null,
    workCost: round2(workCost),
    reserve: round2(reserve),
    remaining: round2(remaining),
    budgetNeeded: round2(budgetNeeded),
  };
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** One plain sentence for the result, as the admin would say it. */
export function describe(i: CalcInput, r: CalcResult): string {
  const team = `${r.people} ${r.people === 1 ? "person" : "people"} working ${i.hoursPerDay} hours a day`;
  const end = r.endDate ? `, ending ${longDate(r.endDate)}` : "";
  if (i.mode === "budget") {
    return `${naira(i.budget)} keeps ${team} for ${r.workingDays} working days (about ${r.weeks} weeks)${end}, with ${naira(r.reserve)} held back.`;
  }
  const verdict =
    i.budget > 0 ? (r.remaining >= 0 ? ` That leaves ${naira(r.remaining)} of the ${naira(i.budget)} budget.` : ` That is ${naira(-r.remaining)} more than the ${naira(i.budget)} budget.`) : "";
  return `${r.workingDays} working days for ${team} costs ${naira(r.workCost)}, or ${naira(r.budgetNeeded)} with the reserve${end}.${verdict}`;
}

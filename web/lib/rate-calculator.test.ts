// Run: npm test (node --experimental-strip-types --test). Self-check of the calculator maths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addWorkingDays, calculate, type CalcInput } from "./rate-calculator.ts";

const base: CalcInput = {
  mode: "budget",
  budget: 5_000_000,
  team: [{ id: "a", label: "Architects", count: 3, rate: 5000 }],
  hoursPerDay: 8,
  daysPerWeek: 5,
  contingencyPct: 10,
  overtimeMultiplier: 1.5,
  startDate: null,
  workingDays: 0,
};

test("budget mode: ₦5m, 3 × ₦5,000/h, 8h, 10% reserve → ₦120,000 a day, 37.5 days", () => {
  const r = calculate(base)!;
  assert.equal(r.costPerDay, 120_000);
  assert.equal(r.workingDays, 37.5);
  assert.equal(r.reserve, 500_000);
  assert.equal(r.personHours, 900);
});

test("hours above 8 are overtime at the multiplier", () => {
  const r = calculate({ ...base, hoursPerDay: 10 })!;
  // 15,000/h × 8 + 15,000/h × 2 × 1.5
  assert.equal(r.costPerDay, 165_000);
});

test("cost mode agrees with budget mode and reports a shortfall", () => {
  const r = calculate({ ...base, mode: "cost", workingDays: 37.5 })!;
  assert.equal(r.budgetNeeded, 5_000_000);
  assert.equal(r.remaining, 0);
  const over = calculate({ ...base, mode: "cost", workingDays: 50 })!;
  assert.ok(over.remaining < 0);
});

test("end date skips weekends", () => {
  // Mon 16 Nov 2026 + 6 working days → Mon 23 Nov 2026
  assert.equal(addWorkingDays("2026-11-16", 6, 5), "2026-11-23");
  assert.equal(calculate({ ...base, startDate: "2026-11-16" })!.endDate, addWorkingDays("2026-11-16", 38, 5));
});

test("nothing to calculate without a team", () => {
  assert.equal(calculate({ ...base, team: [] }), null);
});

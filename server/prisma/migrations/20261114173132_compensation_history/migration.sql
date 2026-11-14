-- Compensation becomes a history (spec §20). Existing single rows become the open (current) row.
ALTER TABLE "Compensation" DROP CONSTRAINT "Compensation_employeeId_fkey";
DROP INDEX "Compensation_employeeId_key";

ALTER TABLE "Compensation" RENAME COLUMN "effectiveDate" TO "effectiveFrom";
ALTER TABLE "Compensation" ADD COLUMN "effectiveTo" DATE;
ALTER TABLE "Compensation" ALTER COLUMN "currency" SET DEFAULT 'NGN';

-- Never delete pay history along with an employee.
ALTER TABLE "Compensation" ADD CONSTRAINT "Compensation_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Compensation_employeeId_effectiveFrom_idx" ON "Compensation"("employeeId", "effectiveFrom");
-- Exactly one open (current) rate per employee, and periods must be ordered (spec §41).
CREATE UNIQUE INDEX "Compensation_one_open_per_employee" ON "Compensation"("employeeId") WHERE "effectiveTo" IS NULL;
ALTER TABLE "Compensation" ADD CONSTRAINT "Compensation_period_ordered" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
ALTER TABLE "Compensation" ADD CONSTRAINT "Compensation_rates_positive" CHECK ("baseHourlyRate" > 0 AND "overtimeHourlyRate" > 0);

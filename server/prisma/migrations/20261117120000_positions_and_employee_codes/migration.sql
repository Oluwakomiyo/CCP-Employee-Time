-- Positions become a managed list, like departments: the employee form picks from it.
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Position_name_key" ON "Position"("name");

-- Backfill from the free-text values already in use (trimmed).
UPDATE "Employee" SET "position" = btrim("position");
INSERT INTO "Position" ("id", "name", "updatedAt")
SELECT gen_random_uuid()::text, p, CURRENT_TIMESTAMP FROM (SELECT DISTINCT "position" AS p FROM "Employee") x;

CREATE INDEX "Employee_position_idx" ON "Employee"("position");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_position_fkey"
  FOREIGN KEY ("position") REFERENCES "Position"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Employee numbers (EMP-001, EMP-002, ...) are issued by the system from this sequence,
-- so two admins creating people at once never get the same number. Starts after any EMP-n already used.
CREATE SEQUENCE "employee_code_seq" START 1;
SELECT setval('employee_code_seq',
  COALESCE((SELECT MAX(substring("employeeCode" FROM '^EMP-(\d+)$')::int) FROM "Employee"), 0) + 1, false);

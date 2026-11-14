-- Departments become a managed list (filters and reports group by them, spec §60).
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- Backfill from the free-text values already in use (trimmed).
UPDATE "Employee" SET "department" = btrim("department");
INSERT INTO "Department" ("id", "name", "updatedAt")
SELECT gen_random_uuid()::text, d, CURRENT_TIMESTAMP FROM (SELECT DISTINCT "department" AS d FROM "Employee") x;

CREATE INDEX "Employee_department_idx" ON "Employee"("department");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_department_fkey"
  FOREIGN KEY ("department") REFERENCES "Department"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

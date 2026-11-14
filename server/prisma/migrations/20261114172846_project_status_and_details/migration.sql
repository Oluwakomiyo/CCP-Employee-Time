-- Project lifecycle status (spec §21) replaces the isActive flag; existing data is carried over.
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

ALTER TABLE "Project"
  ADD COLUMN "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "clientName" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "estimatedHours" DECIMAL(10,2),
  ADD COLUMN "createdById" TEXT;

UPDATE "Project" SET "status" = CASE WHEN "isActive" THEN 'ACTIVE'::"ProjectStatus" ELSE 'COMPLETED'::"ProjectStatus" END;

DROP INDEX IF EXISTS "Project_isActive_idx";
ALTER TABLE "Project" DROP COLUMN "isActive";
CREATE INDEX "Project_status_idx" ON "Project"("status");

ALTER TABLE "Project" ADD CONSTRAINT "Project_estimatedHours_nonnegative" CHECK ("estimatedHours" IS NULL OR "estimatedHours" >= 0);
ALTER TABLE "Project" ADD CONSTRAINT "Project_dates_ordered" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");

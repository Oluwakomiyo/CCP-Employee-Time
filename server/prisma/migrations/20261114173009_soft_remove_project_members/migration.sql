-- Removing someone from a project now sets removedAt instead of deleting the row (spec §22).
ALTER TABLE "ProjectMember" ADD COLUMN "removedAt" TIMESTAMPTZ(6);

-- A pair may have many past memberships but only one current one (spec §41).
DROP INDEX "ProjectMember_projectId_employeeId_key";
CREATE UNIQUE INDEX "ProjectMember_one_active" ON "ProjectMember"("projectId", "employeeId") WHERE "removedAt" IS NULL;

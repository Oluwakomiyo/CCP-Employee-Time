-- Roles become data: three system presets plus any role the admin creates.
-- Permission rows are filled from code (src/auth/permissions.ts PRESETS) by ensureSystemRoles() on boot,
-- so the presets have one source of truth.
CREATE TYPE "PermissionScope" AS ENUM ('OWN', 'TEAM', 'ALL');

CREATE TABLE "AppRole" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(300),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "presetOf" "Role",
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "AppRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AppRole_key_key" ON "AppRole"("key");
CREATE UNIQUE INDEX "AppRole_name_key" ON "AppRole"("name");

CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permission" VARCHAR(64) NOT NULL,
    "scope" "PermissionScope",
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permission")
);
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The three system roles (names and keys match PRESETS).
INSERT INTO "AppRole" ("id", "key", "name", "description", "isSystem", "presetOf", "updatedAt") VALUES
  (gen_random_uuid()::text, 'ceo_admin', 'CEO / Admin', 'Full access, including pay, payroll and company settings.', true, 'CEO_ADMIN', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'project_manager', 'Project manager', 'Runs the projects they lead and looks after the people on them. No pay or payroll.', true, 'PROJECT_MANAGER', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'employee', 'Employee', 'Tracks their own time and asks for fixes to it.', true, 'EMPLOYEE', CURRENT_TIMESTAMP);

-- Every existing user keeps the access they have today.
ALTER TABLE "User" ADD COLUMN "roleId" TEXT;
UPDATE "User" u SET "roleId" = r."id" FROM "AppRole" r WHERE r."presetOf" = u."role";
ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "AppRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

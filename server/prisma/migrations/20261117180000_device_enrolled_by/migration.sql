-- Devices can now add themselves (desktop app enrollment); existing ones were added by an admin.
CREATE TYPE "DeviceEnrollment" AS ENUM ('ADMIN', 'SELF');
ALTER TABLE "EmployeeDevice" ADD COLUMN "enrolledBy" "DeviceEnrollment" NOT NULL DEFAULT 'ADMIN';

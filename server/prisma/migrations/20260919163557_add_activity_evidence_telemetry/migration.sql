-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('OFFICE', 'SITE', 'REMOTE');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('NORMAL', 'REVIEW', 'INSUFFICIENT_EVIDENCE', 'MISSING_DATA', 'SITE_WORK');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'IDLE', 'LOCKED', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "HeartbeatSource" AS ENUM ('BROWSER', 'DESKTOP_AGENT');

-- AlterTable
ALTER TABLE "WorkDay" ADD COLUMN     "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "WorkSegment" ADD COLUMN     "location" "LocationType" NOT NULL DEFAULT 'OFFICE';

-- CreateTable
CREATE TABLE "EmployeeDevice" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "deviceName" VARCHAR(100) NOT NULL,
    "deviceIdentifier" VARCHAR(128) NOT NULL,
    "platform" VARCHAR(50) NOT NULL,
    "apiKeyHash" VARCHAR(64) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EmployeeDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityHeartbeat" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDayId" TEXT,
    "deviceId" TEXT,
    "source" "HeartbeatSource" NOT NULL DEFAULT 'BROWSER',
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientTimestamp" TIMESTAMPTZ(6),
    "sessionStatus" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "idleSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDevice_deviceIdentifier_key" ON "EmployeeDevice"("deviceIdentifier");

-- CreateIndex
CREATE INDEX "EmployeeDevice_employeeId_idx" ON "EmployeeDevice"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeDevice_deviceIdentifier_idx" ON "EmployeeDevice"("deviceIdentifier");

-- CreateIndex
CREATE INDEX "ActivityHeartbeat_employeeId_receivedAt_idx" ON "ActivityHeartbeat"("employeeId", "receivedAt");

-- CreateIndex
CREATE INDEX "ActivityHeartbeat_workDayId_idx" ON "ActivityHeartbeat"("workDayId");

-- CreateIndex
CREATE INDEX "ActivityHeartbeat_deviceId_idx" ON "ActivityHeartbeat"("deviceId");

-- AddForeignKey
ALTER TABLE "EmployeeDevice" ADD CONSTRAINT "EmployeeDevice_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityHeartbeat" ADD CONSTRAINT "ActivityHeartbeat_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityHeartbeat" ADD CONSTRAINT "ActivityHeartbeat_workDayId_fkey" FOREIGN KEY ("workDayId") REFERENCES "WorkDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityHeartbeat" ADD CONSTRAINT "ActivityHeartbeat_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "EmployeeDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

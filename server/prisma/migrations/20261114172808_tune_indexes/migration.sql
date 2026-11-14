-- DropIndex
DROP INDEX "Employee_employeeCode_idx";

-- DropIndex
DROP INDEX "EmployeeDevice_deviceIdentifier_idx";

-- DropIndex
DROP INDEX "PayrollRecord_employeeId_idx";

-- DropIndex
DROP INDEX "Project_code_idx";

-- DropIndex
DROP INDEX "TimeCorrectionRequest_workDayId_idx";

-- DropIndex
DROP INDEX "User_email_idx";

-- DropIndex
DROP INDEX "WorkDay_employeeId_date_idx";

-- DropIndex
DROP INDEX "WorkSegment_workDayId_idx";

-- CreateIndex
CREATE INDEX "TimeCorrectionRequest_workDayId_status_idx" ON "TimeCorrectionRequest"("workDayId", "status");

-- CreateIndex
CREATE INDEX "WorkDay_status_idx" ON "WorkDay"("status");

-- CreateIndex
CREATE INDEX "WorkSegment_workDayId_status_idx" ON "WorkSegment"("workDayId", "status");

-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_workSegmentId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityHeartbeat" DROP CONSTRAINT "ActivityHeartbeat_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "Break" DROP CONSTRAINT "Break_workSegmentId_fkey";

-- DropForeignKey
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_userId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeeDevice" DROP CONSTRAINT "EmployeeDevice_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "PayrollRecord" DROP CONSTRAINT "PayrollRecord_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMember" DROP CONSTRAINT "ProjectMember_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "TimeCorrectionRequest" DROP CONSTRAINT "TimeCorrectionRequest_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "TimeCorrectionRequest" DROP CONSTRAINT "TimeCorrectionRequest_workDayId_fkey";

-- DropForeignKey
ALTER TABLE "WorkDay" DROP CONSTRAINT "WorkDay_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "WorkSegment" DROP CONSTRAINT "WorkSegment_workDayId_fkey";

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDay" ADD CONSTRAINT "WorkDay_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSegment" ADD CONSTRAINT "WorkSegment_workDayId_fkey" FOREIGN KEY ("workDayId") REFERENCES "WorkDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDevice" ADD CONSTRAINT "EmployeeDevice_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Break" ADD CONSTRAINT "Break_workSegmentId_fkey" FOREIGN KEY ("workSegmentId") REFERENCES "WorkSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_workSegmentId_fkey" FOREIGN KEY ("workSegmentId") REFERENCES "WorkSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityHeartbeat" ADD CONSTRAINT "ActivityHeartbeat_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeCorrectionRequest" ADD CONSTRAINT "TimeCorrectionRequest_workDayId_fkey" FOREIGN KEY ("workDayId") REFERENCES "WorkDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeCorrectionRequest" ADD CONSTRAINT "TimeCorrectionRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

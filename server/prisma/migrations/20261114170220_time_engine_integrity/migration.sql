-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('DESIGN', 'CLIENT_MEETING', 'SITE_INSPECTION', 'DOCUMENTATION', 'DRAWING', 'ADMINISTRATION', 'OTHER');

-- AlterEnum
ALTER TYPE "LocationType" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "activityType" "ActivityType" NOT NULL DEFAULT 'OTHER',
ALTER COLUMN "title" DROP NOT NULL;

-- Concurrency backstops (spec §42): at most one open segment per workday,
-- one open break per segment and one open activity per segment.
CREATE UNIQUE INDEX "WorkSegment_one_active_per_day" ON "WorkSegment"("workDayId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "Break_one_open_per_segment" ON "Break"("workSegmentId") WHERE "endTime" IS NULL;
CREATE UNIQUE INDEX "Activity_one_open_per_segment" ON "Activity"("workSegmentId") WHERE "endTime" IS NULL;

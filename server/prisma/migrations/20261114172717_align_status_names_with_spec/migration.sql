-- Day statuses renamed to the spec's vocabulary (§23); existing rows keep their meaning.
ALTER TYPE "DayStatus" RENAME VALUE 'CLOSED' TO 'COMPLETED';
ALTER TYPE "DayStatus" RENAME VALUE 'FLAGGED_MISSING_CLOCKOUT' TO 'MISSING_CLOCK_OUT';
ALTER TYPE "DayStatus" RENAME VALUE 'APPROVED' TO 'CORRECTED';

-- Break types reduced to the spec's set (§13): REST -> SHORT_BREAK, MEDICAL/UNPAID -> OTHER.
CREATE TYPE "BreakType_new" AS ENUM ('LUNCH', 'SHORT_BREAK', 'OTHER');
ALTER TABLE "Break" ALTER COLUMN "breakType" DROP DEFAULT;
ALTER TABLE "Break" ALTER COLUMN "breakType" TYPE "BreakType_new" USING (
  CASE "breakType"::text
    WHEN 'LUNCH' THEN 'LUNCH'
    WHEN 'REST' THEN 'SHORT_BREAK'
    ELSE 'OTHER'
  END
)::"BreakType_new";
DROP TYPE "BreakType";
ALTER TYPE "BreakType_new" RENAME TO "BreakType";
ALTER TABLE "Break" ALTER COLUMN "breakType" SET DEFAULT 'SHORT_BREAK';

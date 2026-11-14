-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- AlterTable
ALTER TABLE "PayrollRecord" ADD COLUMN     "finalizedAt" TIMESTAMPTZ(6),
ADD COLUMN     "finalizedById" TEXT,
ADD COLUMN     "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
ALTER COLUMN "currency" SET DEFAULT 'NGN';

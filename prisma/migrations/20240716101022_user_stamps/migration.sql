-- AlterTable
ALTER TABLE "tbl_activities" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tbl_beneficiaries_groups_tokens" ADD COLUMN     "createdBy" TEXT;

-- AlterTable
ALTER TABLE "tbl_daily_monitoring" ADD COLUMN     "createdBy" TEXT;

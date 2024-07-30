-- AlterTable
ALTER TABLE "tbl_activities" ADD COLUMN     "differenceInTriggerAndActivityCompletion" TEXT,
ADD COLUMN     "notes" TEXT,
ALTER COLUMN "description" DROP NOT NULL;

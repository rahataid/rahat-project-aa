/*
  Warnings:

  - The values [ACTION] on the enum `Phase` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "ActivityTypes" AS ENUM ('GENERAL', 'AUTOMATED');

-- AlterEnum
BEGIN;
CREATE TYPE "Phase_new" AS ENUM ('PREPAREDNESS', 'READINESS', 'ACTIVATION');
ALTER TABLE "tbl_phases" ALTER COLUMN "name" TYPE "Phase_new" USING ("name"::text::"Phase_new");
ALTER TYPE "Phase" RENAME TO "Phase_old";
ALTER TYPE "Phase_new" RENAME TO "Phase";
DROP TYPE "Phase_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "tbl_triggers" DROP CONSTRAINT "tbl_triggers_phaseId_fkey";

-- AlterTable
ALTER TABLE "tbl_activities" ADD COLUMN     "activityType" "ActivityTypes" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "tbl_phases" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receivedMandatoryTriggers" INTEGER DEFAULT 0,
ADD COLUMN     "receivedOptionalTriggers" INTEGER DEFAULT 0,
ADD COLUMN     "requiredMandatoryTriggers" INTEGER DEFAULT 0,
ADD COLUMN     "requiredOptionalTriggers" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "tbl_triggers" ADD COLUMN     "isMandatory" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "phaseId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "tbl_triggers" ADD CONSTRAINT "tbl_triggers_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "tbl_phases"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

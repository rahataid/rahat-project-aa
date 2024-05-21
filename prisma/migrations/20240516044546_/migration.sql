/*
  Warnings:

  - You are about to drop the `tbl_triggers_data` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "ActivitiesStatus" ADD VALUE 'DELAYED';

-- DropForeignKey
ALTER TABLE "tbl_triggers_data" DROP CONSTRAINT "tbl_triggers_data_triggerId_fkey";

-- AlterTable
ALTER TABLE "tbl_activities" ADD COLUMN     "activityDocuments" JSONB;

-- AlterTable
ALTER TABLE "tbl_triggers" ADD COLUMN     "triggerDocuments" JSONB;

-- DropTable
DROP TABLE "tbl_triggers_data";

-- CreateTable
CREATE TABLE "tbl_sources_data" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "source" TEXT,
    "location" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_sources_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_sources_data_uuid_key" ON "tbl_sources_data"("uuid");

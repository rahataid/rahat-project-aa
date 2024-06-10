/*
  Warnings:

  - You are about to drop the column `hazardTypeId` on the `tbl_activities` table. All the data in the column will be lost.
  - You are about to drop the column `hazardTypeId` on the `tbl_triggers` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "tbl_activities" DROP CONSTRAINT "tbl_activities_hazardTypeId_fkey";

-- DropForeignKey
ALTER TABLE "tbl_triggers" DROP CONSTRAINT "tbl_triggers_hazardTypeId_fkey";

-- AlterTable
ALTER TABLE "tbl_activities" DROP COLUMN "hazardTypeId";

-- AlterTable
ALTER TABLE "tbl_triggers" DROP COLUMN "hazardTypeId";

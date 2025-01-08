/*
  Warnings:

  - You are about to drop the column `location` on the `tbl_beneficiaries` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "tbl_beneficiaries" DROP COLUMN "location";

-- AlterTable
ALTER TABLE "tbl_disbursement" ALTER COLUMN "planUid" DROP NOT NULL;

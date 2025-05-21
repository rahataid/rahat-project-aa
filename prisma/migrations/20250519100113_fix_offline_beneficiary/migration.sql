/*
  Warnings:

  - You are about to drop the column `disbursementId` on the `tbl_offline_beneficiaries` table. All the data in the column will be lost.
  - You are about to drop the column `txHash` on the `tbl_offline_beneficiaries` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "tbl_offline_beneficiaries" DROP CONSTRAINT "tbl_offline_beneficiaries_disbursementId_fkey";

-- DropIndex
DROP INDEX "tbl_offline_beneficiaries_disbursementId_key";

-- AlterTable
ALTER TABLE "tbl_offline_beneficiaries" DROP COLUMN "disbursementId",
DROP COLUMN "txHash";

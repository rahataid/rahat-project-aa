/*
  Warnings:

  - Added the required column `beneficiaryId` to the `tbl_offline_beneficiaries` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "tbl_offline_beneficiaries" ADD COLUMN     "beneficiaryId" UUID NOT NULL;

-- AddForeignKey
ALTER TABLE "tbl_offline_beneficiaries" ADD CONSTRAINT "tbl_offline_beneficiaries_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "tbl_beneficiaries"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

/*
  Warnings:

  - A unique constraint covering the columns `[disbursementId]` on the table `tbl_offline_beneficiaries` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `disbursementId` to the `tbl_offline_beneficiaries` table without a default value. This is not possible if the table is not empty.
  - Added the required column `txHash` to the `tbl_offline_beneficiaries` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "tbl_offline_beneficiaries" DROP CONSTRAINT "tbl_offline_beneficiaries_beneficiaryId_fkey";

-- AlterTable
ALTER TABLE "tbl_offline_beneficiaries" ADD COLUMN     "disbursementId" UUID NOT NULL,
ADD COLUMN     "txHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tbl_offline_beneficiaries_disbursementId_key" ON "tbl_offline_beneficiaries"("disbursementId");

-- AddForeignKey
ALTER TABLE "tbl_offline_beneficiaries" ADD CONSTRAINT "tbl_offline_beneficiaries_disbursementId_fkey" FOREIGN KEY ("disbursementId") REFERENCES "tbl_disbursement"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

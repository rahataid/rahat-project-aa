/*
  Warnings:

  - Changed the type of `vendorId` on the `tbl_offline_beneficiaries` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `disbursementId` on the `tbl_offline_beneficiaries` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "tbl_offline_beneficiaries" DROP CONSTRAINT "tbl_offline_beneficiaries_disbursementId_fkey";

-- DropForeignKey
ALTER TABLE "tbl_offline_beneficiaries" DROP CONSTRAINT "tbl_offline_beneficiaries_vendorId_fkey";

-- AlterTable
ALTER TABLE "tbl_offline_beneficiaries" DROP COLUMN "vendorId",
ADD COLUMN     "vendorId" UUID NOT NULL,
DROP COLUMN "disbursementId",
ADD COLUMN     "disbursementId" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tbl_offline_beneficiaries_disbursementId_key" ON "tbl_offline_beneficiaries"("disbursementId");

-- AddForeignKey
ALTER TABLE "tbl_offline_beneficiaries" ADD CONSTRAINT "tbl_offline_beneficiaries_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "tbl_vendors"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_offline_beneficiaries" ADD CONSTRAINT "tbl_offline_beneficiaries_disbursementId_fkey" FOREIGN KEY ("disbursementId") REFERENCES "tbl_disbursement"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

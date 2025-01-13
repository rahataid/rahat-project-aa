/*
  Warnings:

  - Changed the type of `amount` on the `tbl_offline_beneficiaries` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "tbl_offline_beneficiaries" DROP COLUMN "amount",
ADD COLUMN     "amount" DOUBLE PRECISION NOT NULL;

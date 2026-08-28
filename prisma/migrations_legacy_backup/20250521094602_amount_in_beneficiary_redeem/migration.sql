/*
  Warnings:

  - Added the required column `amount` to the `tbl_beneficiary_redeem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "tbl_beneficiary_redeem" ADD COLUMN     "amount" INTEGER NOT NULL,
ADD COLUMN     "txHash" TEXT;

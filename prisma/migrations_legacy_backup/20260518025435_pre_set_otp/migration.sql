/*
  Warnings:

  - A unique constraint covering the columns `[walletAddress]` on the table `tbl_otp` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "tbl_otp" ADD COLUMN     "otp" TEXT,
ADD COLUMN     "walletAddress" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tbl_otp_walletAddress_key" ON "tbl_otp"("walletAddress");

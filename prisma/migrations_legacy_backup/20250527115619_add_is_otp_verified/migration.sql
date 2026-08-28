/*
  Warnings:

  - You are about to drop the column `isVerified` on the `tbl_beneficiary_otp` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "tbl_beneficiary_otp" DROP COLUMN "isVerified";

-- AlterTable
ALTER TABLE "tbl_otp" ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false;

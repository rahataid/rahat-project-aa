/*
  Warnings:

  - You are about to drop the `tbl_wallet_replace_log` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "tbl_wallet_replace_log" DROP CONSTRAINT "tbl_wallet_replace_log_beneficiaryWalletAddress_fkey";

-- AlterTable
ALTER TABLE "tbl_stakeholders" ADD COLUMN     "supportArea" TEXT[];

-- DropTable
DROP TABLE "tbl_wallet_replace_log";

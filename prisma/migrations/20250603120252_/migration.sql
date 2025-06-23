/*
  Warnings:

  - You are about to drop the column `beneficiaryWalletAddress` on the `tbl_wallet_replace_log` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "tbl_wallet_replace_log" DROP CONSTRAINT "tbl_wallet_replace_log_beneficiaryWalletAddress_fkey";

-- AlterTable
ALTER TABLE "tbl_wallet_replace_log" DROP COLUMN "beneficiaryWalletAddress";

-- AddForeignKey
ALTER TABLE "tbl_wallet_replace_log" ADD CONSTRAINT "tbl_wallet_replace_log_uuid_fkey" FOREIGN KEY ("uuid") REFERENCES "tbl_beneficiaries"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

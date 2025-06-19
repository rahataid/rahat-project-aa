/*
  Warnings:

  - You are about to drop the column `hasRedeemed` on the `tbl_beneficiary_redeem` table. All the data in the column will be lost.
  - Changed the type of `transactionType` on the `tbl_beneficiary_redeem` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "PayoutTransactionType" AS ENUM ('TOKEN_TRANSFER', 'FIAT_TRANSFER', 'VENDOR_REIMBURSEMENT');

-- CreateEnum
CREATE TYPE "PayoutTransactionStatus" AS ENUM ('PENDING', 'TOKEN_TRANSACTION_INITIATED', 'TOKEN_TRANSACTION_COMPLETED', 'TOKEN_TRANSACTION_FAILED', 'FIAT_TRANSACTION_INITIATED', 'FIAT_TRANSACTION_COMPLETED', 'FIAT_TRANSACTION_FAILED', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "tbl_beneficiary_redeem" DROP COLUMN "hasRedeemed",
ADD COLUMN     "info" JSONB,
ADD COLUMN     "isCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payoutId" TEXT,
ADD COLUMN     "status" "PayoutTransactionStatus" NOT NULL DEFAULT 'PENDING',
DROP COLUMN "transactionType",
ADD COLUMN     "transactionType" "PayoutTransactionType" NOT NULL;

-- AddForeignKey
ALTER TABLE "tbl_beneficiary_redeem" ADD CONSTRAINT "tbl_beneficiary_redeem_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "tbl_beneficiaries_groups_payouts"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

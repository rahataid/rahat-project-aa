/*
  Warnings:

  - The values [CVA] on the enum `PayoutType` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `transactionType` to the `tbl_beneficiary_redeem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
DROP TYPE IF EXISTS "PayoutType_new";
CREATE TYPE "PayoutType_new" AS ENUM ('FSP', 'VENDOR');

-- DropForeignKey
ALTER TABLE "tbl_beneficiary_redeem" DROP CONSTRAINT "tbl_beneficiary_redeem_vendorUid_fkey";

-- AlterTable
ALTER TABLE "tbl_beneficiaries_groups_payouts" ADD COLUMN "payoutProcessorId" TEXT;

-- AlterTable
ALTER TABLE "tbl_beneficiary_redeem" 
ADD COLUMN "fspId" TEXT,
ADD COLUMN "transactionType" "PayoutType_new" NOT NULL,
ALTER COLUMN "vendorUid" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tbl_triggers" ADD COLUMN "isOnchainSuccess" BOOLEAN NOT NULL DEFAULT false;

-- Now alter the existing columns to use the new enum type
ALTER TABLE "tbl_beneficiaries_groups_payouts" ALTER COLUMN "type" TYPE "PayoutType_new" USING ("type"::text::"PayoutType_new");

-- Rename the enum types
ALTER TYPE "PayoutType" RENAME TO "PayoutType_old";
ALTER TYPE "PayoutType_new" RENAME TO "PayoutType";
DROP TYPE "PayoutType_old";

-- AddForeignKey
ALTER TABLE "tbl_beneficiary_redeem" ADD CONSTRAINT "tbl_beneficiary_redeem_vendorUid_fkey" FOREIGN KEY ("vendorUid") REFERENCES "tbl_vendors"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

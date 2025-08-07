/*
  Warnings:

  - You are about to drop the column `groupId` on the `tbl_beneficiaries_groups_payouts` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[payoutId]` on the table `tbl_beneficiaries_groups_tokens` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "tbl_beneficiaries_groups_payouts" DROP CONSTRAINT "tbl_beneficiaries_groups_payouts_groupId_fkey";

-- DropIndex
DROP INDEX "tbl_beneficiaries_groups_payouts_groupId_key";

-- AlterTable
ALTER TABLE "tbl_beneficiaries_groups_payouts" DROP COLUMN "groupId";

-- AlterTable
ALTER TABLE "tbl_beneficiaries_groups_tokens" ADD COLUMN     "payoutId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_groups_tokens_payoutId_key" ON "tbl_beneficiaries_groups_tokens"("payoutId");

-- AddForeignKey
ALTER TABLE "tbl_beneficiaries_groups_tokens" ADD CONSTRAINT "tbl_beneficiaries_groups_tokens_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "tbl_beneficiaries_groups_payouts"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

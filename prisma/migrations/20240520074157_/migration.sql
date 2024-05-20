-- AlterTable
ALTER TABLE "tbl_beneficiaries" ADD COLUMN     "benTokens" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tbl_beneficiaries_groups" ADD COLUMN     "groupTokens" INTEGER NOT NULL DEFAULT 0;

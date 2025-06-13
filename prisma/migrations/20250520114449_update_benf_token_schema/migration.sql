-- AlterTable
ALTER TABLE "tbl_beneficiaries_groups_tokens" ADD COLUMN     "info" JSONB,
ADD COLUMN     "isDisbursed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'NOT_DISBURSED';

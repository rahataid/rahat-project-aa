/*
  Warnings:

  - The values [PROCESSED] on the enum `OfflineBeneficiaryStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "OfflineBeneficiaryStatus_new" AS ENUM ('PENDING', 'REQUESTED', 'SYNCED', 'FAILED');
ALTER TABLE "tbl_offline_beneficiaries_mcn" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tbl_offline_beneficiaries" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tbl_offline_beneficiaries" ALTER COLUMN "status" TYPE "OfflineBeneficiaryStatus_new" USING ("status"::text::"OfflineBeneficiaryStatus_new");
ALTER TABLE "tbl_offline_beneficiaries_mcn" ALTER COLUMN "status" TYPE "OfflineBeneficiaryStatus_new" USING ("status"::text::"OfflineBeneficiaryStatus_new");
ALTER TYPE "OfflineBeneficiaryStatus" RENAME TO "OfflineBeneficiaryStatus_old";
ALTER TYPE "OfflineBeneficiaryStatus_new" RENAME TO "OfflineBeneficiaryStatus";
DROP TYPE "OfflineBeneficiaryStatus_old";
ALTER TABLE "tbl_offline_beneficiaries_mcn" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "tbl_offline_beneficiaries" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

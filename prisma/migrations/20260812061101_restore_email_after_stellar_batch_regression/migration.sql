-- Corrective migration: 20260729121412_add_temp_for_stellar_batch_txn accidentally
-- dropped tbl_otp.email (generated against a stale schema.prisma missing the field).
-- Re-applying the original 20260727094056_add_email_for_otp_verification change.

-- AlterTable
ALTER TABLE "tbl_otp" ADD COLUMN     "email" TEXT,
ALTER COLUMN "phoneNumber" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tbl_otp_email_key" ON "tbl_otp"("email");

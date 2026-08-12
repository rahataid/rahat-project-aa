/*
  Warnings:

  - You are about to drop the column `email` on the `tbl_otp` table. All the data in the column will be lost.
  - Made the column `phoneNumber` on table `tbl_otp` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "StellarBatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- DropIndex
DROP INDEX "tbl_otp_email_key";

-- AlterTable
ALTER TABLE "tbl_otp" DROP COLUMN "email",
ALTER COLUMN "phoneNumber" SET NOT NULL;

-- CreateTable
CREATE TABLE "tbl_stellar_disburse_batches" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "groupTokenUuid" TEXT NOT NULL,
    "batchIndex" INTEGER NOT NULL,
    "totalBatches" INTEGER NOT NULL,
    "status" "StellarBatchStatus" NOT NULL DEFAULT 'PENDING',
    "txHash" TEXT,
    "recipientCount" INTEGER NOT NULL,
    "totalAmount" TEXT NOT NULL,
    "recipients" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "timeTakenMs" INTEGER,
    "error" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_stellar_disburse_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_stellar_disburse_batches_uuid_key" ON "tbl_stellar_disburse_batches"("uuid");

-- CreateIndex
CREATE INDEX "tbl_stellar_disburse_batches_groupTokenUuid_idx" ON "tbl_stellar_disburse_batches"("groupTokenUuid");

-- CreateIndex
CREATE INDEX "tbl_stellar_disburse_batches_status_idx" ON "tbl_stellar_disburse_batches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_stellar_disburse_batches_groupTokenUuid_batchIndex_key" ON "tbl_stellar_disburse_batches"("groupTokenUuid", "batchIndex");

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SettingDataType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'OBJECT');

-- CreateEnum
CREATE TYPE "PayoutType" AS ENUM ('FSP', 'VENDOR');

-- CreateEnum
CREATE TYPE "PayoutMode" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "PayoutTransactionType" AS ENUM ('TOKEN_TRANSFER', 'FIAT_TRANSFER', 'VENDOR_REIMBURSEMENT');

-- CreateEnum
CREATE TYPE "PayoutTransactionStatus" AS ENUM ('PENDING', 'TOKEN_TRANSACTION_INITIATED', 'TOKEN_TRANSACTION_COMPLETED', 'TOKEN_TRANSACTION_FAILED', 'FIAT_TRANSACTION_INITIATED', 'FIAT_TRANSACTION_COMPLETED', 'FIAT_TRANSACTION_FAILED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "GroupPurpose" AS ENUM ('BANK_TRANSFER', 'MOBILE_MONEY', 'COMMUNICATION', 'GENERAL');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "tbl_beneficiaries" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "phone" TEXT,
    "gender" "Gender" DEFAULT 'UNKNOWN',
    "benTokens" INTEGER DEFAULT 0,
    "extras" JSONB,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_beneficiaries_groups" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "groupPurpose" "GroupPurpose",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiaries_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_beneficiaries_to_groups" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "beneficiaryId" UUID NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiaries_to_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_beneficiaries_groups_tokens" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "numberOfTokens" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'NOT_DISBURSED',
    "isDisbursed" BOOLEAN NOT NULL DEFAULT false,
    "info" JSONB,
    "groupId" TEXT NOT NULL,
    "payoutId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiaries_groups_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_beneficiaries_groups_payouts" (
    "int" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "type" "PayoutType" NOT NULL,
    "mode" "PayoutMode" NOT NULL,
    "status" TEXT,
    "extras" JSONB,
    "payoutProcessorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiaries_groups_payouts_pkey" PRIMARY KEY ("int")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_uuid_key" ON "tbl_beneficiaries"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_walletAddress_key" ON "tbl_beneficiaries"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_groups_uuid_key" ON "tbl_beneficiaries_groups"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_to_groups_uuid_key" ON "tbl_beneficiaries_to_groups"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_to_groups_beneficiaryId_groupId_key" ON "tbl_beneficiaries_to_groups"("beneficiaryId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_groups_tokens_uuid_key" ON "tbl_beneficiaries_groups_tokens"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_groups_tokens_payoutId_key" ON "tbl_beneficiaries_groups_tokens"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_groups_payouts_uuid_key" ON "tbl_beneficiaries_groups_payouts"("uuid");

-- AddForeignKey
ALTER TABLE "tbl_beneficiaries_to_groups" ADD CONSTRAINT "tbl_beneficiaries_to_groups_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "tbl_beneficiaries"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_beneficiaries_to_groups" ADD CONSTRAINT "tbl_beneficiaries_to_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tbl_beneficiaries_groups"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_beneficiaries_groups_tokens" ADD CONSTRAINT "tbl_beneficiaries_groups_tokens_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tbl_beneficiaries_groups"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_beneficiaries_groups_tokens" ADD CONSTRAINT "tbl_beneficiaries_groups_tokens_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "tbl_beneficiaries_groups_payouts"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;


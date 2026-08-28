-- CreateEnum
CREATE TYPE "TokenRedemptionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'STELLAR_VERIFIED', 'STELLAR_FAILED');

-- CreateTable
CREATE TABLE "tbl_vendor_token_redemption" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "vendorUuid" UUID NOT NULL,
    "redemptionStatus" "TokenRedemptionStatus" NOT NULL DEFAULT 'REQUESTED',
    "tokenAmount" INTEGER NOT NULL DEFAULT 0,
    "transactionHash" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_vendor_token_redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_beneficiary_redeem" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "beneficiaryWalletAddress" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "transactionType" "PayoutTransactionType" NOT NULL,
    "status" "PayoutTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "fspId" TEXT,
    "txHash" TEXT,
    "vendorUid" UUID,
    "payoutId" TEXT,
    "info" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiary_redeem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_vendor_token_redemption_uuid_key" ON "tbl_vendor_token_redemption"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiary_redeem_uuid_key" ON "tbl_beneficiary_redeem"("uuid");

-- AddForeignKey
ALTER TABLE "tbl_vendor_token_redemption" ADD CONSTRAINT "tbl_vendor_token_redemption_vendorUuid_fkey" FOREIGN KEY ("vendorUuid") REFERENCES "tbl_vendors"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_beneficiary_redeem" ADD CONSTRAINT "tbl_beneficiary_redeem_beneficiaryWalletAddress_fkey" FOREIGN KEY ("beneficiaryWalletAddress") REFERENCES "tbl_beneficiaries"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_beneficiary_redeem" ADD CONSTRAINT "tbl_beneficiary_redeem_vendorUid_fkey" FOREIGN KEY ("vendorUid") REFERENCES "tbl_vendors"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_beneficiary_redeem" ADD CONSTRAINT "tbl_beneficiary_redeem_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "tbl_beneficiaries_groups_payouts"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;


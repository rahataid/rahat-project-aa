-- CreateTable
CREATE TABLE "tbl_disbursement_logs" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "txnHash" TEXT NOT NULL,
    "beneficiaryGroupTokenId" TEXT NOT NULL,
    "beneficiaryWalletAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_disbursement_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_disbursement_logs_uuid_key" ON "tbl_disbursement_logs"("uuid");

-- AddForeignKey
ALTER TABLE "tbl_disbursement_logs" ADD CONSTRAINT "tbl_disbursement_logs_beneficiaryGroupTokenId_fkey" FOREIGN KEY ("beneficiaryGroupTokenId") REFERENCES "tbl_beneficiaries_groups_tokens"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_disbursement_logs" ADD CONSTRAINT "tbl_disbursement_logs_beneficiaryWalletAddress_fkey" FOREIGN KEY ("beneficiaryWalletAddress") REFERENCES "tbl_beneficiaries"("walletAddress") ON DELETE SET NULL ON UPDATE CASCADE;

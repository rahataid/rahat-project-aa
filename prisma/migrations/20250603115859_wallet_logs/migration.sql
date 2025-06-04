-- CreateTable
CREATE TABLE "tbl_wallet_replace_log" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "beneficiaryWalletAddress" TEXT NOT NULL,
    "oldWalletAddress" TEXT NOT NULL,
    "newWalletAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_wallet_replace_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_wallet_replace_log_uuid_key" ON "tbl_wallet_replace_log"("uuid");

-- AddForeignKey
ALTER TABLE "tbl_wallet_replace_log" ADD CONSTRAINT "tbl_wallet_replace_log_beneficiaryWalletAddress_fkey" FOREIGN KEY ("beneficiaryWalletAddress") REFERENCES "tbl_beneficiaries"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

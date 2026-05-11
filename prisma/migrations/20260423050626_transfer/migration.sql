-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('TREASURY', 'VENDOR', 'OFFRAMP');

-- CreateTable
CREATE TABLE "tbl_transfer" (
    "id" SERIAL NOT NULL,
    "transactionId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "blockNumber" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "blockTimeStamp" TEXT NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_transfer_transactionId_key" ON "tbl_transfer"("transactionId");

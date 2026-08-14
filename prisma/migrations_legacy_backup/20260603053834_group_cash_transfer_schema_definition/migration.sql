-- CreateTable
CREATE TABLE "tbl_group_cash_transfer_details" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "bankDetails" JSONB,
    "extras" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_group_cash_transfer_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_group_cash_transfer_records" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "groupCashTransferId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION DEFAULT 0,
    "payoutProcessorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_group_cash_transfer_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_group_cash_transfer_details_uuid_key" ON "tbl_group_cash_transfer_details"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_group_cash_transfer_records_uuid_key" ON "tbl_group_cash_transfer_records"("uuid");

-- AddForeignKey
ALTER TABLE "tbl_group_cash_transfer_records" ADD CONSTRAINT "tbl_group_cash_transfer_records_groupCashTransferId_fkey" FOREIGN KEY ("groupCashTransferId") REFERENCES "tbl_group_cash_transfer_details"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

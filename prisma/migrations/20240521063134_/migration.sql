-- CreateTable
CREATE TABLE "tbl_vouchers" (
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalVouchers" INTEGER NOT NULL DEFAULT 0,
    "assignedVouchers" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_vouchers_uuid_key" ON "tbl_vouchers"("uuid");

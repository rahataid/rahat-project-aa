-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "tbl_vendor_inkind_redemptions" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "redemptionStatus" "RedemptionStatus" NOT NULL DEFAULT 'REQUESTED',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "transactionHash" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "inkindUuid" TEXT NOT NULL,
    "vendorUuid" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_vendor_inkind_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_vendor_inkind_redemptions_uuid_key" ON "tbl_vendor_inkind_redemptions"("uuid");

-- CreateIndex
CREATE INDEX "tbl_vendor_inkind_redemptions_vendorUuid_idx" ON "tbl_vendor_inkind_redemptions"("vendorUuid");

-- CreateIndex
CREATE INDEX "tbl_vendor_inkind_redemptions_updatedAt_idx" ON "tbl_vendor_inkind_redemptions"("updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "tbl_vendor_inkind_redemptions" ADD CONSTRAINT "tbl_vendor_inkind_redemptions_inkindUuid_fkey" FOREIGN KEY ("inkindUuid") REFERENCES "tbl_inkinds"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_vendor_inkind_redemptions" ADD CONSTRAINT "tbl_vendor_inkind_redemptions_vendorUuid_fkey" FOREIGN KEY ("vendorUuid") REFERENCES "tbl_vendors"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "tbl_beneficiary_inkind_redemptions" ADD COLUMN     "txHash" TEXT,
ADD COLUMN     "vendorUid" UUID;

-- AlterTable
ALTER TABLE "tbl_group_inkinds" ADD COLUMN     "createdBy" TEXT;

-- CreateIndex
CREATE INDEX "tbl_beneficiary_inkind_redemptions_vendorUid_idx" ON "tbl_beneficiary_inkind_redemptions"("vendorUid");

-- AddForeignKey
ALTER TABLE "tbl_beneficiary_inkind_redemptions" ADD CONSTRAINT "tbl_beneficiary_inkind_redemptions_vendorUid_fkey" FOREIGN KEY ("vendorUid") REFERENCES "tbl_vendors"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

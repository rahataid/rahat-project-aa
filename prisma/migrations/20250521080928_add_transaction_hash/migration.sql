-- AlterTable
ALTER TABLE "tbl_beneficiary_redeem" ADD COLUMN     "txHash" TEXT;

-- CreateTable
CREATE TABLE "tbl_offline_otp_stellar" (
    "id" SERIAL NOT NULL,
    "beneficiaryUID" UUID NOT NULL,
    "otpId" INTEGER NOT NULL,
    "vendorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_offline_otp_stellar_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tbl_offline_otp_stellar" ADD CONSTRAINT "tbl_offline_otp_stellar_beneficiaryUID_fkey" FOREIGN KEY ("beneficiaryUID") REFERENCES "tbl_beneficiaries"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_offline_otp_stellar" ADD CONSTRAINT "tbl_offline_otp_stellar_otpId_fkey" FOREIGN KEY ("otpId") REFERENCES "tbl_otp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_offline_otp_stellar" ADD CONSTRAINT "tbl_offline_otp_stellar_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "tbl_vendors"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "tbl_offline_beneficiaries_mcn" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "vendorId" UUID NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "OfflineBeneficiaryStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "beneficiaryId" UUID NOT NULL,

    CONSTRAINT "tbl_offline_beneficiaries_mcn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_offline_beneficiaries_mcn_uuid_key" ON "tbl_offline_beneficiaries_mcn"("uuid");

-- AddForeignKey
ALTER TABLE "tbl_offline_beneficiaries_mcn" ADD CONSTRAINT "tbl_offline_beneficiaries_mcn_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "tbl_beneficiaries"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_offline_beneficiaries_mcn" ADD CONSTRAINT "tbl_offline_beneficiaries_mcn_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "tbl_vendors"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

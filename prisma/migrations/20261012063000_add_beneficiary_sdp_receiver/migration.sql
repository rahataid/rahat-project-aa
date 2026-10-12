-- CreateTable
CREATE TABLE "tbl_beneficiary_sdp_receivers" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "beneficiaryId" UUID NOT NULL,
    "sdpReceiverId" TEXT NOT NULL,
    "lastSyncedPhone" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiary_sdp_receivers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiary_sdp_receivers_uuid_key" ON "tbl_beneficiary_sdp_receivers"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiary_sdp_receivers_beneficiaryId_key" ON "tbl_beneficiary_sdp_receivers"("beneficiaryId");

-- AddForeignKey
ALTER TABLE "tbl_beneficiary_sdp_receivers" ADD CONSTRAINT "tbl_beneficiary_sdp_receivers_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "tbl_beneficiaries"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

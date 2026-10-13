-- CreateTable
-- New table: maps one AA beneficiary to one SDP receiver (sdpReceiverId),
-- so phone edits can be PATCHed straight to SDP instead of relying on SDP's
-- own (broken) phone-based receiver matching. See docs/sdp/sdp-beneficiary-phone-sync-plan.md.
CREATE TABLE "tbl_beneficiary_sdp_receivers" (
    "id" SERIAL NOT NULL,                              -- local PK
    "uuid" TEXT NOT NULL,                               -- external-facing id
    "beneficiaryId" UUID NOT NULL,                      -- FK to tbl_beneficiaries.uuid, unique below
    "sdpReceiverId" TEXT NOT NULL,                      -- SDP's receiver.id, used by PATCH /receivers/{id}
    "lastSyncedPhone" TEXT,                             -- phone last confirmed synced to SDP
    "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',         -- SYNCED | PENDING | FAILED
    "lastSyncError" TEXT,                                -- last PATCH failure message
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiary_sdp_receivers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- uuid is unique, same convention as every other mapping table in this schema.
CREATE UNIQUE INDEX "tbl_beneficiary_sdp_receivers_uuid_key" ON "tbl_beneficiary_sdp_receivers"("uuid");

-- CreateIndex
-- Enforces the 1:1: a beneficiary can only ever have one SDP receiver row.
CREATE UNIQUE INDEX "tbl_beneficiary_sdp_receivers_beneficiaryId_key" ON "tbl_beneficiary_sdp_receivers"("beneficiaryId");

-- AddForeignKey
-- Ties the row to its beneficiary; cascades on beneficiary uuid update, blocks delete while a mapping row exists.
ALTER TABLE "tbl_beneficiary_sdp_receivers" ADD CONSTRAINT "tbl_beneficiary_sdp_receivers_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "tbl_beneficiaries"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

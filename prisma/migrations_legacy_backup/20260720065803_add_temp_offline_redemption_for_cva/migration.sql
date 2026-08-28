-- CreateTable
CREATE TABLE "tbl_temp_offline_redemptions" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "chainType" TEXT NOT NULL,
    "vendorId" TEXT,
    "payoutId" TEXT,
    "payloads" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_temp_offline_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_temp_offline_redemptions_uuid_key" ON "tbl_temp_offline_redemptions"("uuid");

-- CreateIndex
CREATE INDEX "tbl_temp_offline_redemptions_status_idx" ON "tbl_temp_offline_redemptions"("status");

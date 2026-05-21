-- CreateTable
CREATE TABLE "tbl_temp_offline_inkind_redemptions" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "user" JSONB NOT NULL,
    "vendor" JSONB NOT NULL,
    "payloads" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_temp_offline_inkind_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_temp_offline_inkind_redemptions_uuid_key" ON "tbl_temp_offline_inkind_redemptions"("uuid");

-- CreateIndex
CREATE INDEX "tbl_temp_offline_inkind_redemptions_status_idx" ON "tbl_temp_offline_inkind_redemptions"("status");

-- CreateIndex
CREATE INDEX "tbl_temp_offline_inkind_redemptions_vendorId_idx" ON "tbl_temp_offline_inkind_redemptions"("vendorId");

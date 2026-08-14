-- CreateEnum (with check if exists)
DO $$ BEGIN
    CREATE TYPE "TokenRedemptionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable (with check if exists)
CREATE TABLE IF NOT EXISTS "tbl_vendor_token_redemption" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "vendorUuid" UUID NOT NULL,
    "redemptionStatus" "TokenRedemptionStatus" NOT NULL DEFAULT 'REQUESTED',
    "tokenAmount" INTEGER NOT NULL DEFAULT 0,
    "transactionHash" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_vendor_token_redemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (with check if exists)
CREATE UNIQUE INDEX IF NOT EXISTS "tbl_vendor_token_redemption_uuid_key" ON "tbl_vendor_token_redemption"("uuid");

-- AddForeignKey (with check if exists)
DO $$ BEGIN
    ALTER TABLE "tbl_vendor_token_redemption" ADD CONSTRAINT "tbl_vendor_token_redemption_vendorUuid_fkey" FOREIGN KEY ("vendorUuid") REFERENCES "tbl_vendors"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

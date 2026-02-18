-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

-- Add enum values with error handling
DO $$ BEGIN
    ALTER TYPE "TokenRedemptionStatus" ADD VALUE 'STELLAR_VERIFIED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE "TokenRedemptionStatus" ADD VALUE 'STELLAR_FAILED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

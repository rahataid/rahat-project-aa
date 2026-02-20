-- Add resolvedAt and closedAt columns
ALTER TABLE "tbl_grievances" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
ALTER TABLE "tbl_grievances" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

-- Backfill resolvedAt only for RESOLVED grievances using updatedAt
UPDATE "tbl_grievances"
SET "resolvedAt" = "updatedAt"
WHERE "status" = 'RESOLVED'
  AND "resolvedAt" IS NULL;

-- Backfill closedAt for CLOSED grievances using updatedAt
UPDATE "tbl_grievances"
SET "closedAt" = "updatedAt"
WHERE "status" = 'CLOSED'
  AND "closedAt" IS NULL;



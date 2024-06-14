-- CreateTable
CREATE TABLE "tbl_daily_monitoring" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "dataEntryBy" TEXT NOT NULL,
    "source" TEXT,
    "location" TEXT,
    "data" JSONB NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_daily_monitoring_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_daily_monitoring_uuid_key" ON "tbl_daily_monitoring"("uuid");

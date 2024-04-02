-- CreateTable
CREATE TABLE "tbl_schedule" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "repeatEvery" INTEGER NOT NULL,
    "dangerLevel" INTEGER NOT NULL,
    "warningLevel" INTEGER NOT NULL,
    "triggerActivity" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_schedule_uuid_key" ON "tbl_schedule"("uuid");

-- CreateTable
CREATE TABLE "tbl_communications" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "transportId" TEXT NOT NULL,
    "groupUID" UUID,
    "sessionId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_communications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_communications_uuid_key" ON "tbl_communications"("uuid");

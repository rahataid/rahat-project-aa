-- CreateTable
CREATE TABLE "tbl_pdf_generation_jobs" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "groupId" TEXT,
    "fileUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_pdf_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_pdf_generation_jobs_uuid_key" ON "tbl_pdf_generation_jobs"("uuid");

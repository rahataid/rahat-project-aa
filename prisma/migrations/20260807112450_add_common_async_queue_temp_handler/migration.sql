-- CreateTable
CREATE TABLE "tbl_async_queue_jobs" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "jobTypeData" JSONB NOT NULL,
    "metadata" JSONB,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_async_queue_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_async_queue_jobs_uuid_key" ON "tbl_async_queue_jobs"("uuid");

-- CreateIndex
CREATE INDEX "tbl_async_queue_jobs_jobName_status_idx" ON "tbl_async_queue_jobs"("jobName", "status");

-- CreateIndex
CREATE INDEX "tbl_async_queue_jobs_createdAt_idx" ON "tbl_async_queue_jobs"("createdAt");

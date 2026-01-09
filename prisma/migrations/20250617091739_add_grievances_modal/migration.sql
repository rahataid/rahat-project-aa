-- CreateEnum
CREATE TYPE "GrievanceType" AS ENUM ('TECHNICAL', 'OPERATIONAL', 'FINANCIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "GrievanceStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED');

-- CreateTable
CREATE TABLE "tbl_grievances" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "reporterUserId" INTEGER NOT NULL,
    "reporterContact" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "GrievanceType" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "GrievanceStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_grievances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_grievances_uuid_key" ON "tbl_grievances"("uuid");
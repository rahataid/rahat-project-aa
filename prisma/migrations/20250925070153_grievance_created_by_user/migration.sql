-- CreateEnum
CREATE TYPE "GrievanceStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GrievanceType" AS ENUM ('TECHNICAL', 'NON_TECHNICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "GrievancePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "tbl_grievances" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "reporterContact" TEXT NOT NULL,
    "tags" TEXT[],
    "title" TEXT NOT NULL,
    "type" "GrievanceType" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "GrievanceStatus" NOT NULL DEFAULT 'NEW',
    "priority" "GrievancePriority" NOT NULL DEFAULT 'LOW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdByUser" JSONB NOT NULL,

    CONSTRAINT "tbl_grievances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_grievances_uuid_key" ON "tbl_grievances"("uuid");

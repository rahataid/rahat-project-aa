/*
  Warnings:

  - The `priority` column on the `tbl_grievances` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "GrievancePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "tbl_grievances" DROP COLUMN "priority",
ADD COLUMN     "priority" "GrievancePriority" NOT NULL DEFAULT 'LOW';

-- DropEnum
DROP TYPE "Priority";

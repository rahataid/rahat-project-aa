-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "tbl_grievances" ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'LOW';

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN');

-- AlterTable
ALTER TABLE "tbl_beneficiaries" ADD COLUMN     "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN';

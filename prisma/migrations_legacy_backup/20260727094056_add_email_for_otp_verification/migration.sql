/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `tbl_otp` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "tbl_otp" ADD COLUMN     "email" TEXT,
ALTER COLUMN "phoneNumber" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tbl_otp_email_key" ON "tbl_otp"("email");

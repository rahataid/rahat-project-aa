/*
  Warnings:

  - Added the required column `title` to the `tbl_group_cash_transfer_records` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "tbl_group_cash_transfer_records" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "title" TEXT NOT NULL;

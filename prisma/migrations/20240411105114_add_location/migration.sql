/*
  Warnings:

  - Added the required column `location` to the `tbl_schedule` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "tbl_schedule" ADD COLUMN     "location" TEXT NOT NULL;

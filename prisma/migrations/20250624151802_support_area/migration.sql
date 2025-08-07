/*
  Warnings:

  - You are about to drop the `tbl_wallet_replace_log` table. If the table is not empty, all the data it contains will be lost.

*/

-- AlterTable
ALTER TABLE "tbl_stakeholders" ADD COLUMN     "supportArea" TEXT[];

-- DropTable

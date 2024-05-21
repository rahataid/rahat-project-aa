/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `tbl_vouchers` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "tbl_vouchers_name_key" ON "tbl_vouchers"("name");

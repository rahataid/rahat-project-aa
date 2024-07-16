/*
  Warnings:

  - A unique constraint covering the columns `[phone]` on the table `tbl_stakeholders` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "tbl_stakeholders_phone_key" ON "tbl_stakeholders"("phone");

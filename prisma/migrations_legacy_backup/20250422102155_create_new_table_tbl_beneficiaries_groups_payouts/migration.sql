-- CreateEnum
CREATE TYPE "PayoutType" AS ENUM ('FSP', 'CVA');

-- CreateEnum
CREATE TYPE "PayoutMode" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateTable
CREATE TABLE "tbl_beneficiaries_groups_payouts" (
    "int" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "type" "PayoutType" NOT NULL,
    "mode" "PayoutMode" NOT NULL,
    "status" TEXT,
    "extras" JSONB,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiaries_groups_payouts_pkey" PRIMARY KEY ("int")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_groups_payouts_uuid_key" ON "tbl_beneficiaries_groups_payouts"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_groups_payouts_groupId_key" ON "tbl_beneficiaries_groups_payouts"("groupId");

-- AddForeignKey
ALTER TABLE "tbl_beneficiaries_groups_payouts" ADD CONSTRAINT "tbl_beneficiaries_groups_payouts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tbl_beneficiaries_groups_tokens"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

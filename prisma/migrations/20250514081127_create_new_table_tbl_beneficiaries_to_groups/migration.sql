-- CreateTable
CREATE TABLE "tbl_beneficiaries_to_groups" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "beneficiaryId" UUID NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiaries_to_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_to_groups_uuid_key" ON "tbl_beneficiaries_to_groups"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_to_groups_beneficiaryId_groupId_key" ON "tbl_beneficiaries_to_groups"("beneficiaryId", "groupId");

-- AddForeignKey
ALTER TABLE "tbl_beneficiaries_to_groups" ADD CONSTRAINT "tbl_beneficiaries_to_groups_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "tbl_beneficiaries"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_beneficiaries_to_groups" ADD CONSTRAINT "tbl_beneficiaries_to_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tbl_beneficiaries_groups"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

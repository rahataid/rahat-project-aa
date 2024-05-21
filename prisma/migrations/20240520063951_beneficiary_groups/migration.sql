-- CreateTable
CREATE TABLE "tbl_beneficiaries_groups" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiaries_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BeneficiaryToBeneficiaryGroups" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_groups_uuid_key" ON "tbl_beneficiaries_groups"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "_BeneficiaryToBeneficiaryGroups_AB_unique" ON "_BeneficiaryToBeneficiaryGroups"("A", "B");

-- CreateIndex
CREATE INDEX "_BeneficiaryToBeneficiaryGroups_B_index" ON "_BeneficiaryToBeneficiaryGroups"("B");

-- AddForeignKey
ALTER TABLE "_BeneficiaryToBeneficiaryGroups" ADD CONSTRAINT "_BeneficiaryToBeneficiaryGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "tbl_beneficiaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BeneficiaryToBeneficiaryGroups" ADD CONSTRAINT "_BeneficiaryToBeneficiaryGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "tbl_beneficiaries_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "tbl_groups" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "autoCreated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "createdBy" TEXT,

    CONSTRAINT "tbl_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_beneficiary_groups" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "beneficiaryUID" UUID NOT NULL,
    "groupUID" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiary_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_groups_uuid_key" ON "tbl_groups"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_groups_name_key" ON "tbl_groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiary_groups_uuid_key" ON "tbl_beneficiary_groups"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiary_groups_beneficiaryUID_groupUID_key" ON "tbl_beneficiary_groups"("beneficiaryUID", "groupUID");

-- AddForeignKey
ALTER TABLE "tbl_beneficiary_groups" ADD CONSTRAINT "tbl_beneficiary_groups_beneficiaryUID_fkey" FOREIGN KEY ("beneficiaryUID") REFERENCES "tbl_beneficiaries"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_beneficiary_groups" ADD CONSTRAINT "tbl_beneficiary_groups_groupUID_fkey" FOREIGN KEY ("groupUID") REFERENCES "tbl_groups"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

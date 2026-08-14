-- CreateTable
CREATE TABLE "tbl_stakeholders" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "designation" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "municipality" TEXT NOT NULL,
    "supportArea" TEXT[],
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_stakeholders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_stakeholders_groups" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_stakeholders_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_stats" (
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "group" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_stats_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "tbl_vendors" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT,
    "extras" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_StakeholdersToStakeholdersGroups" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_stakeholders_uuid_key" ON "tbl_stakeholders"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_stakeholders_phone_key" ON "tbl_stakeholders"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_stakeholders_groups_uuid_key" ON "tbl_stakeholders_groups"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_stats_name_key" ON "tbl_stats"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_vendors_uuid_key" ON "tbl_vendors"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_vendors_walletAddress_key" ON "tbl_vendors"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "_StakeholdersToStakeholdersGroups_AB_unique" ON "_StakeholdersToStakeholdersGroups"("A", "B");

-- CreateIndex
CREATE INDEX "_StakeholdersToStakeholdersGroups_B_index" ON "_StakeholdersToStakeholdersGroups"("B");

-- AddForeignKey
ALTER TABLE "_StakeholdersToStakeholdersGroups" ADD CONSTRAINT "_StakeholdersToStakeholdersGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "tbl_stakeholders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StakeholdersToStakeholdersGroups" ADD CONSTRAINT "_StakeholdersToStakeholdersGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "tbl_stakeholders_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;


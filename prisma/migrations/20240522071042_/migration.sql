-- CreateEnum
CREATE TYPE "Phase" AS ENUM ('PREPAREDNESS', 'READINESS', 'ACTIVATION');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('DHM', 'GLOFAS', 'MANUAL');

-- CreateEnum
CREATE TYPE "ActivitiesStatus" AS ENUM ('NOT_STARTED', 'WORK_IN_PROGRESS', 'COMPLETED', 'DELAYED');

-- CreateEnum
CREATE TYPE "ActivityTypes" AS ENUM ('GENERAL', 'AUTOMATED');

-- CreateEnum
CREATE TYPE "SettingDataType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'OBJECT');

-- CreateTable
CREATE TABLE "tbl_beneficiaries" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "walletAddress" TEXT,
    "extras" JSONB,
    "benTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_beneficiaries_groups" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "groupTokens" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiaries_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_vouchers" (
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalVouchers" INTEGER NOT NULL DEFAULT 0,
    "assignedVouchers" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "tbl_settings" (
    "name" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "dataType" "SettingDataType" NOT NULL,
    "requiredFields" TEXT[],
    "isReadOnly" BOOLEAN NOT NULL DEFAULT false,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tbl_settings_pkey" PRIMARY KEY ("name")
);

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
CREATE TABLE "tbl_hazard_types" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_hazard_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_phases" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" "Phase" NOT NULL,
    "requiredMandatoryTriggers" INTEGER DEFAULT 0,
    "requiredOptionalTriggers" INTEGER DEFAULT 0,
    "receivedMandatoryTriggers" INTEGER DEFAULT 0,
    "receivedOptionalTriggers" INTEGER DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_activity_categories" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_activity_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_activities" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "hazardTypeId" TEXT NOT NULL,
    "leadTime" TEXT NOT NULL,
    "responsibility" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ActivitiesStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "activityType" "ActivityTypes" NOT NULL DEFAULT 'GENERAL',
    "activityDocuments" JSONB,
    "activityCommunication" JSONB,
    "activityPayout" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_triggers" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "repeatKey" TEXT NOT NULL,
    "title" TEXT,
    "dataSource" "DataSource" NOT NULL,
    "location" TEXT,
    "repeatEvery" TEXT,
    "triggerStatement" JSONB,
    "triggerDocuments" JSONB,
    "notes" TEXT,
    "phaseId" TEXT,
    "hazardTypeId" TEXT,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "isTriggered" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_sources_data" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "source" TEXT,
    "location" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_sources_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BeneficiaryToBeneficiaryGroups" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "_StakeholdersToStakeholdersGroups" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "_ActivitiesToTriggers" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_uuid_key" ON "tbl_beneficiaries"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_groups_uuid_key" ON "tbl_beneficiaries_groups"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_vouchers_uuid_key" ON "tbl_vouchers"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_vouchers_name_key" ON "tbl_vouchers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_settings_name_key" ON "tbl_settings"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_stakeholders_uuid_key" ON "tbl_stakeholders"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_stakeholders_groups_uuid_key" ON "tbl_stakeholders_groups"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_hazard_types_uuid_key" ON "tbl_hazard_types"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_hazard_types_name_key" ON "tbl_hazard_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_phases_uuid_key" ON "tbl_phases"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_phases_name_key" ON "tbl_phases"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_activity_categories_uuid_key" ON "tbl_activity_categories"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_activities_uuid_key" ON "tbl_activities"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_triggers_uuid_key" ON "tbl_triggers"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_triggers_repeatKey_key" ON "tbl_triggers"("repeatKey");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_sources_data_uuid_key" ON "tbl_sources_data"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "_BeneficiaryToBeneficiaryGroups_AB_unique" ON "_BeneficiaryToBeneficiaryGroups"("A", "B");

-- CreateIndex
CREATE INDEX "_BeneficiaryToBeneficiaryGroups_B_index" ON "_BeneficiaryToBeneficiaryGroups"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_StakeholdersToStakeholdersGroups_AB_unique" ON "_StakeholdersToStakeholdersGroups"("A", "B");

-- CreateIndex
CREATE INDEX "_StakeholdersToStakeholdersGroups_B_index" ON "_StakeholdersToStakeholdersGroups"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ActivitiesToTriggers_AB_unique" ON "_ActivitiesToTriggers"("A", "B");

-- CreateIndex
CREATE INDEX "_ActivitiesToTriggers_B_index" ON "_ActivitiesToTriggers"("B");

-- AddForeignKey
ALTER TABLE "tbl_activities" ADD CONSTRAINT "tbl_activities_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "tbl_phases"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_activities" ADD CONSTRAINT "tbl_activities_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "tbl_activity_categories"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_activities" ADD CONSTRAINT "tbl_activities_hazardTypeId_fkey" FOREIGN KEY ("hazardTypeId") REFERENCES "tbl_hazard_types"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_triggers" ADD CONSTRAINT "tbl_triggers_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "tbl_phases"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_triggers" ADD CONSTRAINT "tbl_triggers_hazardTypeId_fkey" FOREIGN KEY ("hazardTypeId") REFERENCES "tbl_hazard_types"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BeneficiaryToBeneficiaryGroups" ADD CONSTRAINT "_BeneficiaryToBeneficiaryGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "tbl_beneficiaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BeneficiaryToBeneficiaryGroups" ADD CONSTRAINT "_BeneficiaryToBeneficiaryGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "tbl_beneficiaries_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StakeholdersToStakeholdersGroups" ADD CONSTRAINT "_StakeholdersToStakeholdersGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "tbl_stakeholders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StakeholdersToStakeholdersGroups" ADD CONSTRAINT "_StakeholdersToStakeholdersGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "tbl_stakeholders_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ActivitiesToTriggers" ADD CONSTRAINT "_ActivitiesToTriggers_A_fkey" FOREIGN KEY ("A") REFERENCES "tbl_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ActivitiesToTriggers" ADD CONSTRAINT "_ActivitiesToTriggers_B_fkey" FOREIGN KEY ("B") REFERENCES "tbl_triggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

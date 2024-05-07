-- CreateEnum
CREATE TYPE "Phase" AS ENUM ('PREPAREDNESS', 'READINESS', 'ACTION');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('DHM', 'GLOFAS', 'MANUAL');

-- CreateEnum
CREATE TYPE "ActivitiesStatus" AS ENUM ('NOT_STARTED', 'WORK_IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ActivityTypes" AS ENUM ('COMMUNICATION', 'PAYOUT', 'GENERAL');

-- CreateTable
CREATE TABLE "tbl_beneficiaries" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "walletAddress" TEXT,
    "extras" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phoneNumber" TEXT,
    "email" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiaries_pkey" PRIMARY KEY ("id")
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
    "responsibility" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "activityType" "ActivityTypes" NOT NULL DEFAULT 'GENERAL',
    "status" "ActivitiesStatus" NOT NULL DEFAULT 'NOT_STARTED',
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
    "dataSource" "DataSource" NOT NULL,
    "location" TEXT,
    "repeatEvery" TEXT,
    "triggerStatement" JSONB,
    "title" TEXT,
    "notes" TEXT,
    "readinessActivated" BOOLEAN DEFAULT false,
    "activationActivated" BOOLEAN DEFAULT false,
    "readinessActivatedOn" TIMESTAMP(3),
    "activationActivatedOn" TIMESTAMP(3),
    "triggerActivity" TEXT[],
    "hazardTypeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_triggers_data" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "triggerId" TEXT NOT NULL,

    CONSTRAINT "tbl_triggers_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_activity_comms" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "stakeholdersGropuId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_activity_comms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_StakeholdersToStakeholdersGroups" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_uuid_key" ON "tbl_beneficiaries"("uuid");

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
CREATE UNIQUE INDEX "tbl_triggers_data_uuid_key" ON "tbl_triggers_data"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_activity_comms_uuid_key" ON "tbl_activity_comms"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_activity_comms_stakeholdersGropuId_key" ON "tbl_activity_comms"("stakeholdersGropuId");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_activity_comms_activityId_key" ON "tbl_activity_comms"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "_StakeholdersToStakeholdersGroups_AB_unique" ON "_StakeholdersToStakeholdersGroups"("A", "B");

-- CreateIndex
CREATE INDEX "_StakeholdersToStakeholdersGroups_B_index" ON "_StakeholdersToStakeholdersGroups"("B");

-- AddForeignKey
ALTER TABLE "tbl_activities" ADD CONSTRAINT "tbl_activities_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "tbl_phases"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_activities" ADD CONSTRAINT "tbl_activities_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "tbl_activity_categories"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_activities" ADD CONSTRAINT "tbl_activities_hazardTypeId_fkey" FOREIGN KEY ("hazardTypeId") REFERENCES "tbl_hazard_types"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_triggers" ADD CONSTRAINT "tbl_triggers_hazardTypeId_fkey" FOREIGN KEY ("hazardTypeId") REFERENCES "tbl_hazard_types"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_triggers_data" ADD CONSTRAINT "tbl_triggers_data_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "tbl_triggers"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_activity_comms" ADD CONSTRAINT "tbl_activity_comms_stakeholdersGropuId_fkey" FOREIGN KEY ("stakeholdersGropuId") REFERENCES "tbl_stakeholders_groups"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_activity_comms" ADD CONSTRAINT "tbl_activity_comms_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "tbl_activities"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StakeholdersToStakeholdersGroups" ADD CONSTRAINT "_StakeholdersToStakeholdersGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "tbl_stakeholders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StakeholdersToStakeholdersGroups" ADD CONSTRAINT "_StakeholdersToStakeholdersGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "tbl_stakeholders_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('SYNCING_OFFLINE', 'SYNCED_OFFLINE', 'ONLINE');

-- CreateEnum
CREATE TYPE "ReedemStatus" AS ENUM ('REQUESTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "OfflineBeneficiaryStatus" AS ENUM ('PROCESSED', 'PENDING', 'SYNCED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN');

-- CreateTable
CREATE TABLE "tbl_beneficiaries" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "gender" "Gender" DEFAULT 'UNKNOWN',
    "benTokens" INTEGER DEFAULT 0,
    "walletAddress" TEXT NOT NULL,
    "extras" JSONB,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiaries_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_beneficiaries_groups_tokens" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "numberOfTokens" INTEGER NOT NULL DEFAULT 0,
    "groupId" TEXT NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "tbl_beneficiaries_groups_tokens_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "tbl_phases" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" "Phase" NOT NULL,
    "requiredMandatoryTriggers" INTEGER DEFAULT 0,
    "requiredOptionalTriggers" INTEGER DEFAULT 0,
    "receivedMandatoryTriggers" INTEGER DEFAULT 0,
    "receivedOptionalTriggers" INTEGER DEFAULT 0,
    "canRevert" BOOLEAN NOT NULL DEFAULT false,
    "canTriggerPayout" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
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
    "leadTime" TEXT NOT NULL,
    "responsibility" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "status" "ActivitiesStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "isAutomated" BOOLEAN NOT NULL,
    "activityDocuments" JSONB,
    "activityCommunication" JSONB,
    "activityPayout" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "differenceInTriggerAndActivityCompletion" TEXT,
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
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "isTriggered" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "triggeredBy" TEXT,
    "triggeredAt" TIMESTAMP(3),
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
CREATE TABLE "tbl_stats" (
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "group" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_stats_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "tbl_daily_monitoring" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "dataEntryBy" TEXT NOT NULL,
    "source" TEXT,
    "location" TEXT,
    "data" JSONB NOT NULL,
    "createdBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_daily_monitoring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_vendors" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "walletAddress" TEXT NOT NULL,
    "location" TEXT,
    "extras" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_disbursement" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "walletAddress" TEXT NOT NULL,
    "planUid" UUID NOT NULL,
    "status" "DisbursementStatus" NOT NULL DEFAULT 'ONLINE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_disbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_vendor_reimbursment" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "voucherAmount" INTEGER NOT NULL,
    "status" "ReedemStatus" NOT NULL DEFAULT 'REQUESTED',
    "vendorUid" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_vendor_reimbursment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_beneficiary_redeem" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "beneficiaryWalletAddress" TEXT NOT NULL,
    "hasRedeemed" BOOLEAN NOT NULL DEFAULT false,
    "vendorUid" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_beneficiary_redeem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_beneficiary_otp" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "beneficiaryWalletAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_beneficiary_otp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_offline_beneficiaries" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "disbursementId" INTEGER NOT NULL,
    "amount" TEXT NOT NULL,
    "status" "OfflineBeneficiaryStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_offline_beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_StakeholdersToStakeholdersGroups" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_uuid_key" ON "tbl_beneficiaries"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_walletAddress_key" ON "tbl_beneficiaries"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_groups_uuid_key" ON "tbl_beneficiaries_groups"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_groups_tokens_uuid_key" ON "tbl_beneficiaries_groups_tokens"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiaries_groups_tokens_groupId_key" ON "tbl_beneficiaries_groups_tokens"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_settings_name_key" ON "tbl_settings"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_stakeholders_uuid_key" ON "tbl_stakeholders"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_stakeholders_phone_key" ON "tbl_stakeholders"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_stakeholders_groups_uuid_key" ON "tbl_stakeholders_groups"("uuid");

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
CREATE UNIQUE INDEX "tbl_stats_name_key" ON "tbl_stats"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_daily_monitoring_uuid_key" ON "tbl_daily_monitoring"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_vendors_uuid_key" ON "tbl_vendors"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_vendors_walletAddress_key" ON "tbl_vendors"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_disbursement_uuid_key" ON "tbl_disbursement"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_disbursement_walletAddress_key" ON "tbl_disbursement"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_vendor_reimbursment_uuid_key" ON "tbl_vendor_reimbursment"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiary_redeem_uuid_key" ON "tbl_beneficiary_redeem"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiary_otp_uuid_key" ON "tbl_beneficiary_otp"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_offline_beneficiaries_uuid_key" ON "tbl_offline_beneficiaries"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_offline_beneficiaries_disbursementId_key" ON "tbl_offline_beneficiaries"("disbursementId");

-- CreateIndex
CREATE UNIQUE INDEX "_StakeholdersToStakeholdersGroups_AB_unique" ON "_StakeholdersToStakeholdersGroups"("A", "B");

-- CreateIndex
CREATE INDEX "_StakeholdersToStakeholdersGroups_B_index" ON "_StakeholdersToStakeholdersGroups"("B");

-- AddForeignKey
ALTER TABLE "tbl_beneficiaries_groups_tokens" ADD CONSTRAINT "tbl_beneficiaries_groups_tokens_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tbl_beneficiaries_groups"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_activities" ADD CONSTRAINT "tbl_activities_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "tbl_phases"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_activities" ADD CONSTRAINT "tbl_activities_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "tbl_activity_categories"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_triggers" ADD CONSTRAINT "tbl_triggers_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "tbl_phases"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_vendor_reimbursment" ADD CONSTRAINT "tbl_vendor_reimbursment_vendorUid_fkey" FOREIGN KEY ("vendorUid") REFERENCES "tbl_vendors"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_beneficiary_redeem" ADD CONSTRAINT "tbl_beneficiary_redeem_beneficiaryWalletAddress_fkey" FOREIGN KEY ("beneficiaryWalletAddress") REFERENCES "tbl_beneficiaries"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_beneficiary_redeem" ADD CONSTRAINT "tbl_beneficiary_redeem_vendorUid_fkey" FOREIGN KEY ("vendorUid") REFERENCES "tbl_vendors"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_offline_beneficiaries" ADD CONSTRAINT "tbl_offline_beneficiaries_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "tbl_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_offline_beneficiaries" ADD CONSTRAINT "tbl_offline_beneficiaries_disbursementId_fkey" FOREIGN KEY ("disbursementId") REFERENCES "tbl_disbursement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StakeholdersToStakeholdersGroups" ADD CONSTRAINT "_StakeholdersToStakeholdersGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "tbl_stakeholders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StakeholdersToStakeholdersGroups" ADD CONSTRAINT "_StakeholdersToStakeholdersGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "tbl_stakeholders_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

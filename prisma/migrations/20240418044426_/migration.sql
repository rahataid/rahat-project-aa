-- CreateEnum
CREATE TYPE "Phase" AS ENUM ('PREPAREDNESS', 'READINESS', 'ACTION');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('DHM', 'GLOFAS');

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
    "hazardTypesId" TEXT,
    "responsibility" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_data_sources" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "repeatKey" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "dataSource" "DataSource" NOT NULL,
    "repeatEvery" INTEGER NOT NULL,
    "triggerStatement" JSONB NOT NULL,
    "triggerActivity" TEXT[],
    "hazardTypesId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_source_data" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "dataSourceId" TEXT NOT NULL,

    CONSTRAINT "tbl_source_data_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "tbl_data_sources_uuid_key" ON "tbl_data_sources"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_data_sources_repeatKey_key" ON "tbl_data_sources"("repeatKey");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_source_data_uuid_key" ON "tbl_source_data"("uuid");

-- AddForeignKey
ALTER TABLE "tbl_activities" ADD CONSTRAINT "tbl_activities_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "tbl_phases"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_activities" ADD CONSTRAINT "tbl_activities_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "tbl_activity_categories"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_activities" ADD CONSTRAINT "tbl_activities_hazardTypesId_fkey" FOREIGN KEY ("hazardTypesId") REFERENCES "tbl_hazard_types"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_data_sources" ADD CONSTRAINT "tbl_data_sources_hazardTypesId_fkey" FOREIGN KEY ("hazardTypesId") REFERENCES "tbl_hazard_types"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_source_data" ADD CONSTRAINT "tbl_source_data_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "tbl_data_sources"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

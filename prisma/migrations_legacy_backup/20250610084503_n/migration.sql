/*
  Warnings:

  - The primary key for the `_StakeholdersToStakeholdersGroups` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[A,B]` on the table `_StakeholdersToStakeholdersGroups` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "_StakeholdersToStakeholdersGroups" DROP CONSTRAINT "_StakeholdersToStakeholdersGroups_AB_pkey";

-- CreateIndex
CREATE UNIQUE INDEX "_StakeholdersToStakeholdersGroups_AB_unique" ON "_StakeholdersToStakeholdersGroups"("A", "B");

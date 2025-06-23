-- AlterTable
ALTER TABLE "_StakeholdersToStakeholdersGroups" ADD CONSTRAINT "_StakeholdersToStakeholdersGroups_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_StakeholdersToStakeholdersGroups_AB_unique";

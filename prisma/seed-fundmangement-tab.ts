// prisma/seedFundManagementTabConfig.ts
import { Prisma, SettingDataType } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';

const prismaService = new PrismaService();
const settings = new SettingsService(prismaService);

export const seedFundManagementTabConfig = async () => {
  const tabConfig = {
    name: 'FUNDMANAGEMENT_TAB_CONFIG',
    value: {
      tabs: [
        {
          label: 'Cash Tracker',
          value: 'cashTracker',
        },
        {
          label: 'Tokens Overview',
          value: 'tokenOverview',
        },
        {
          label: 'Fund Management List',
          value: 'fundManagementList',
        },
        {
          label: 'In Kind Tracker',
          value: 'inKindTracker',
        },
        {
          label: 'Counselling',
          value: 'counselling',
        },
        {
          label: 'InKind',
          value: 'inKind',
        },
      ],
    },
    dataType: SettingDataType.OBJECT,
    isPrivate: false,
    requiredFields: [],
    isReadOnly: false,
  };
  await prismaService.setting.upsert({
    where: {
      name: tabConfig.name,
    },
    create: tabConfig,
    update: tabConfig,
  });
  console.log('Fund Management tab configuration seeded successfully.');
};

seedFundManagementTabConfig()
  .then(async () => {
    await prismaService.$disconnect();
  })
  .catch(async (error) => {
    console.log(error);
    await prismaService.$disconnect();
  });

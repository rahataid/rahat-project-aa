// prisma/seedForecastTabConfig.ts
import { SettingDataType } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';

const prismaService = new PrismaService();

export const seedPayoutTypeConfig = async () => {
  // Types configuration
  const typesConfig = {
    name: 'PAYOUT_TYPE_CONFIG',
    value: {
      types: [
        {
          key: 'FSP',
          label: 'FSP',
          payoutMethod: true,
        },
        {
          key: 'CVA',
          label: 'CVA',
          toggle: true,
        },
      ],
    },
    dataType: SettingDataType.OBJECT,
    isPrivate: false,
    requiredFields: [],
    isReadOnly: false,
  };

  // Upsert types configuration
  await prismaService.setting.upsert({
    where: { name: typesConfig.name },
    create: typesConfig,
    update: typesConfig,
  });

  console.log(' Payout types configuration seeded successfully.');
};

// Run seeding
seedPayoutTypeConfig()
  .then(async () => {
    await prismaService.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prismaService.$disconnect();
  });

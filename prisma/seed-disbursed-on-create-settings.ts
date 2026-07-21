import { Prisma, SettingDataType } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';

const prismaService = new PrismaService();

const SETTINGS_NAME = 'DISBURSED_ON_CREATE';

export const seedDisbursedOnCreateSettings = async () => {
  const value: Prisma.InputJsonValue = false;

  await prismaService.setting.upsert({
    where: { name: SETTINGS_NAME },
    create: {
      name: SETTINGS_NAME,
      value,
      dataType: SettingDataType.BOOLEAN,
      isPrivate: false,
      requiredFields: [],
      isReadOnly: false,
    },
    update: {
      value,
      isPrivate: false,
    },
  });

  console.log(`${SETTINGS_NAME} seeded (value: ${value})`);
};

if (require.main === module) {
  seedDisbursedOnCreateSettings()
    .then(async () => {
      await prismaService.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prismaService.$disconnect();
      process.exit(1);
    });
}

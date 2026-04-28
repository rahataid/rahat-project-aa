// prisma/seed-evm-settings.ts
import { Prisma, SettingDataType } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';
import * as evmSettings from './data/deployedEvmSettings';

const prismaService = new PrismaService();

const getDataType = (value: unknown): SettingDataType => {
  if (typeof value === 'string') return SettingDataType.STRING;
  if (typeof value === 'number') return SettingDataType.NUMBER;
  if (typeof value === 'boolean') return SettingDataType.BOOLEAN;
  return SettingDataType.OBJECT;
};

const settingsPayload: Prisma.SettingCreateInput[] = Object.entries(
  evmSettings
).map(([name, value]) => ({
  name,
  value: value as Prisma.InputJsonValue,
  dataType: getDataType(value),
  isPrivate: false,
  requiredFields: [],
  isReadOnly: false,
}));
export const seedEvmSettings = async () => {
  const results = await Promise.allSettled(
    settingsPayload.map(async (setting) => {
      return await prismaService.setting.upsert({
        where: {
          name: setting.name,
        },
        create: {
          ...setting,
        },
        update: {
          ...setting,
        },
      });
    })
  );

  const rejectedResults = results.filter(
    (result) => result.status === 'rejected'
  );

  if (rejectedResults.length > 0) {
    console.log('Some settings failed to seed:', rejectedResults);
  } else {
    console.log('All EVM settings seeded successfully.');
  }
};

seedEvmSettings()
  .then(async () => {
    await prismaService.$disconnect();
  })
  .catch(async (error) => {
    console.log(error);
    await prismaService.$disconnect();
  });

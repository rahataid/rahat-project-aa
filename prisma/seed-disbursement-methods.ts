import { SettingDataType } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';

const prismaService = new PrismaService();

export const seedDisbursementMethods = async () => {
  const disbursementMethods = {
    name: 'DISBURSHMENT_METHODS',
    value: ['GROUP_TOKEN', 'TOKEN', 'INKIND'],
    dataType: SettingDataType.OBJECT,
    isPrivate: false,
    requiredFields: [],
    isReadOnly: false,
  };

  await prismaService.setting.upsert({
    where: { name: disbursementMethods.name },
    create: disbursementMethods,
    update: disbursementMethods,
  });

  console.log('Disbursement methods seeded successfully.');
};

seedDisbursementMethods()
  .then(async () => {
    await prismaService.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prismaService.$disconnect();
  });

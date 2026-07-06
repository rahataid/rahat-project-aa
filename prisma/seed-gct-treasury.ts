import { Prisma, SettingDataType } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';

const prismaService = new PrismaService();

const SETTINGS_NAME = 'GCT_TREASURY';

export const seedGctTreasury = async () => {
  const gctToken = process.env.GCT_TOKEN;
  const gctSecretKey = process.env.GCT_SECRET_KEY;
  const gctPublicKey = process.env.GCT_PUBLIC_KEY;

  if (!gctToken || !gctSecretKey || !gctPublicKey) {
    throw new Error(
      'GCT_TOKEN, GCT_SECRET_KEY and GCT_PUBLIC_KEY environment variables are required'
    );
  }

  const value: Prisma.InputJsonValue = {
    GCT_TOKEN: gctToken,
    GCT_SECRET_KEY: gctSecretKey,
    GCT_PUBLIC_KEY: gctPublicKey,
  };

  await prismaService.setting.upsert({
    where: { name: SETTINGS_NAME },
    create: {
      name: SETTINGS_NAME,
      value,
      dataType: SettingDataType.OBJECT,
      isPrivate: false,
      requiredFields: [],
      isReadOnly: false,
    },
    update: {
      value,
      isPrivate: false,
    },
  });

  console.log(`${SETTINGS_NAME} seeded (public key: ${gctPublicKey})`);
};

if (require.main === module) {
  seedGctTreasury()
    .then(async () => {
      await prismaService.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prismaService.$disconnect();
      process.exit(1);
    });
}

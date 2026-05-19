import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const seedR2Settings = async () => {
  const value = {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || 'rahat-qr-pdfs',
    publicDomain: process.env.R2_PUBLIC_DOMAIN || '',
  };

  await prisma.setting.upsert({
    where: { name: 'CLOUDFLARE_R2' },
    update: { value },
    create: {
      name: 'CLOUDFLARE_R2',
      value,
      dataType: 'OBJECT',
      requiredFields: [],
      isReadOnly: false,
      isPrivate: true,
    },
  });

  console.log('CLOUDFLARE_R2 settings seeded');
};

if (require.main === module) {
  seedR2Settings()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}

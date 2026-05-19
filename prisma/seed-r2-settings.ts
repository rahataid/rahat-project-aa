import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const seedR2Settings = async () => {
  const value = {
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || '',
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
    R2_BUCKET: process.env.R2_BUCKET || 'rahat-qr-pdfs',
    R2_PUBLIC_DOMAIN: process.env.R2_PUBLIC_DOMAIN || '',
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

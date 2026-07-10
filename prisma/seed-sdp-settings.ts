import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const seedSdpSettings = async () => {
  const value = {
    sdpUrl: process.env.SDP_URL || 'http://localhost:8000',
    tenantName: process.env.SDP_TENANT_NAME || '',
    apiKey: process.env.SDP_API_KEY || '',
    walletId: process.env.SDP_WALLET_ID || '',
    assetId: process.env.SDP_ASSET_ID || '',
    verificationField: process.env.SDP_VERIFICATION_FIELD || '',
  };

  await prisma.setting.upsert({
    where: { name: 'SDP_SETTINGS' },
    update: { value },
    create: {
      name: 'SDP_SETTINGS',
      value,
      dataType: 'OBJECT',
      requiredFields: [],
      isReadOnly: false,
      isPrivate: true,
    },
  });

  console.log('SDP_SETTINGS seeded successfully');
};

if (require.main === module) {
  seedSdpSettings()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}

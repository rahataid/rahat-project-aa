
import { PrismaService } from '@rumsan/prisma';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from '@rumsan/settings';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const settings = new SettingsService(prismaService);

export const seedOfframp = async () => {
  const url = process.env.PAYMENT_PROVIDER_URL || 'https://api-offramp-dev.rahat.io/v1';

  try {
    const dataSource = await settings.getPublic('OFFRAMP_SETTINGS');

    if (dataSource) {
      console.log('OFFRAMP_SETTINGS already exists');
      await settings.delete('OFFRAMP_SETTINGS');
      console.log('Old OFFRAMP_SETTINGS deleted');
    }
    const paymentProviderValue = {
      url,
      appId: '8edff118-d17f-41ff-bb65-5edaf2e004ab',
      accessToken: 'sk_test_1234567890',
    };

    await settings.create({
      name: 'OFFRAMP_SETTINGS',
      value: paymentProviderValue,
      isPrivate: false,
    });
  } catch (error) {
    console.log('Error creating OFFRAMP_SETTINGS:', error);
  }
};

// Keep the standalone execution capability for when run directly
if (require.main === module) {
  seedOfframp()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.log(error);
      await prisma.$disconnect();
    });
}

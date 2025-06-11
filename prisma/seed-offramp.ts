
import { PrismaService } from '@rumsan/prisma';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from '@rumsan/settings';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const settings = new SettingsService(prismaService);

export const seedOfframp = async () => {
  const url = process.env.PAYMENT_PROVIDER_URL || 'https://api-offramp-dev.rahat.io/v1';

    const paymentProviderValue = {
      url,
      appId: 'f3af9d3a-3e6e-4542-b768-d9758a4fe750',
      accessToken: 'sk_test_1234567890',
    };

  try {
    const dataSource = await settings.getPublic('OFFRAMP_SETTINGS');

    if (dataSource) {
      console.log('OFFRAMP_SETTINGS already exists');
      await settings.delete('OFFRAMP_SETTINGS');
      console.log('Old OFFRAMP_SETTINGS deleted');
    }

    await settings.create({
      name: 'OFFRAMP_SETTINGS',
      value: paymentProviderValue,
      isPrivate: false,
    });
  } catch (error) {
    console.log('Error creating OFFRAMP_SETTINGS:', error);
    await settings.create({
      name: 'OFFRAMP_SETTINGS',
      value: paymentProviderValue,
      isPrivate: false,
    });
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

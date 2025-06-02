
import { PrismaService } from '@rumsan/prisma';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from '@rumsan/settings';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const settings = new SettingsService(prismaService);

export const seedPaymentProvider = async () => {
  const url = process.env.PAYMENT_PROVIDER_URL || 'https://api-offramp-dev.rahat.io/v1';

  try {
    const dataSource = await settings.getPublic('PAYMENT_PROVIDERS');

    if (dataSource) {
      console.log('PAYMENT_PROVIDERS already exists');
      await settings.delete('PAYMENT_PROVIDERS');
      console.log('Old PAYMENT_PROVIDERS deleted');
    }
    const paymentProviderValue = {
      url,
      accessToken: 'sk_test_1234567890',
    };

    await settings.create({
      name: 'PAYMENT_PROVIDERS',
      value: paymentProviderValue,
      isPrivate: false,
    });
  } catch (error) {
    const paymentProviderValue = {
      url,
      accessToken: 'sk_test_1234567890',
    };

    await settings.create({
      name: 'PAYMENT_PROVIDERS',
      value: paymentProviderValue,
      isPrivate: false,
    });
  }
};

// Keep the standalone execution capability for when run directly
if (require.main === module) {
  seedPaymentProvider()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.log(error);
      await prisma.$disconnect();
    });
}

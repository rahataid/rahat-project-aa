import { PrismaService } from '@rumsan/prisma';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from '@rumsan/settings';
import { seedStellar } from './seed-stellar';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const settings = new SettingsService(prismaService);

export const seedEvmChainSetting = async () => {
  const setting = {
    name: 'EVM',
    type: 'evm',
    rpcUrl:
      'https://base-sepolia.g.alchemy.com/v2/9U6ZNgBvVAhsXX6Klq4YN4wNLhW8CfJr',
    chainId: '84532',
    currency: {
      name: 'eth',
      symbol: 'eth',
    },
    explorerUrl: 'https://sepolia.basescan.org/tx/',
  };

  try {
    const dataSource = await settings.getPublic('CHAIN_SETTINGS');

    if (dataSource) {
      console.log('CHAIN_SETTINGS already exists');
      await settings.delete('CHAIN_SETTINGS');
      console.log('Old CHAIN_SETTINGS deleted');
    }

    await settings.create({
      name: 'CHAIN_SETTINGS',
      value: setting,
      isPrivate: false,
    });
  } catch (error) {
    await settings.create({
      name: 'CHAIN_SETTINGS',
      value: setting,
      isPrivate: false,
    });
  }
};

// Keep the standalone execution capability for when run directly
if (require.main === module) {
  seedEvmChainSetting()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.log(error);
      await prisma.$disconnect();
    });
}

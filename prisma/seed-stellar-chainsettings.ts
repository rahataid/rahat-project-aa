import { PrismaService } from '@rumsan/prisma';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from '@rumsan/settings';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const settings = new SettingsService(prismaService);

export const seedStellarChainSetting = async () => {
  const setting = {
    name: 'localhost',
    type: 'stellar',
    rpcUrl:
      'https://arb-sepolia.g.alchemy.com/v2/3-Jf0_L-pBwwla0OYWjLZkEpDiG1xAg-',
    chainId: 'Test SDF Network ; September 2015',
    currency: {
      name: 'stellar',
      symbol: 'stellar',
    },
    explorerUrl: 'https://etherscan.io',
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
  seedStellarChainSetting()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.log(error);
      await prisma.$disconnect();
    });
}

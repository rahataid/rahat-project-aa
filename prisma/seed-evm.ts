import { PrismaService } from '@rumsan/prisma';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from '@rumsan/settings';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const settings = new SettingsService(prismaService);

export const seedStellar = async () => {
  const activeYear = process.env.ACTIVE_YEAR;
  const riverBasin = process.env.RIVER_BASIN;
  if (!activeYear || !riverBasin) {
    throw new Error(
      'ACTIVE_YEAR and RIVER_BASIN environment variables are required'
    );
  }

  // TODO: Refactor the JSON
  const evmValue = {
    rpcUrl:
      'https://base-sepolia.g.alchemy.com/v2/9U6ZNgBvVAhsXX6Klq4YN4wNLhW8CfJr',
    chainId: 11155111,
    name: 'Base Sepolia',
    currencyName: 'Base',
    currencySymbol: 'ETH',
    currencyDecimals: 18,
    explorerUrl: 'https://sepolia.etherscan.io',
    gasLimit: 3000000,
    gasPrice: '5000000000',
    confirmations: 3,
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
      value: evmValue,
      isPrivate: false,
    });
  } catch (error) {
    await settings.create({
      name: 'CHAIN_SETTINGS',
      value: evmValue,
      isPrivate: false,
    });
  }
};

// Keep the standalone execution capability for when run directly
if (require.main === module) {
  seedStellar()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.log(error);
      await prisma.$disconnect();
    });
}

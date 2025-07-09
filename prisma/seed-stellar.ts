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
  const stellarValue = {
    tenantName: 'sandab',
    server: 'https://soroban-testnet.stellar.org',
    keypair: 'SAKQYFOKZFZI2LDGNMMWN3UQA6JP4F3JVUEDHVUYYWHCVQIE764WTGBU',
    email: 'owner@sandab.stellar.rahat.io',
    password: 'Password123!',
    contractId: 'CDIESPF2SHPYTXTAM4EW55TD4DIIMSYBRS72CCRQH2UDCL4IS4KOZEMK',
    vendorAddress: 'GBNYMT3TSPAV5BMPW6QNRZYXN5U3BMDAZE54O7AWGIIZ5CUDIA7RYAEB',
    assetCode: 'RAHAT',
    baseUrl: 'https://api-sdp.stellar.rahat.io',
    adminBaseUrl: 'https://admin-sdp.stellar.rahat.io',
    receiverBaseUrl: 'https://anchor.stellar.rahat.io',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    assetCreator: 'GCVLRQHGZYG32HZE3PKZ52NX5YFCNFDBUZDLUXQYMRS6WVBWSUOP5IYE',
    assetCreatorSecret:
      'SA5S2EF72XXJTLBD4SZEMY7OUGIACQZ4KXPEB7NSEVWGEKZCDOQDBFBE',
    fundingAmount: '10',
    network: 'testnet',
    faucetSecretKey: 'SAVNF6EBFM56QSBCYBKKNXOCZASR5QEHO5AMAGEM2NJN4KIZBHIMGA6A',
  };

  try {
    const dataSource = await settings.getPublic('STELLAR_SETTINGS');

    if (dataSource) {
      console.log('PROJECTINFO already exists');
      await settings.delete('STELLAR_SETTINGS');
      console.log('Old PROJECTINFO deleted');
    }

    await settings.create({
      name: 'STELLAR_SETTINGS',
      value: stellarValue,
      isPrivate: false,
    });
  } catch (error) {
    await settings.create({
      name: 'STELLAR_SETTINGS',
      value: stellarValue,
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

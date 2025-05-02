import { PrismaService } from '@rumsan/prisma';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from '@rumsan/settings';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const settings = new SettingsService(prismaService);

const main = async () => {
  const activeYear = process.env.ACTIVE_YEAR;
  const riverBasin = process.env.RIVER_BASIN;
  if (!activeYear || !riverBasin) {
    throw new Error(
      'ACTIVE_YEAR and RIVER_BASIN environment variables are required'
    );
  }

  try {
    const dataSource = await settings.getPublic('STELLAR_SETTINGS');

    if (dataSource) {
      console.log('PROJECTINFO already exists');
      await settings.delete('STELLAR_SETTINGS');
      console.log('Old PROJECTINFO deleted');
    }
    const stellarValue = {
      tenantName: 'sandab',
      server: 'https://soroban-testnet.stellar.org',
      keypair: 'SAKQYFOKZFZI2LDGNMMWN3UQA6JP4F3JVUEDHVUYYWHCVQIE764WTGBU',
      email: 'owner@sandab.stellar.rahat.io',
      password: 'Password123!',
      contractId: 'CARWC3PLXU7V6EPZ67GDIDIU2ZSXN7ASHSX35G4THJHTVT2ZQY232KN2',
      vendorAddress: 'GBNYMT3TSPAV5BMPW6QNRZYXN5U3BMDAZE54O7AWGIIZ5CUDIA7RYAEB',
    };

    await settings.create({
      name: 'STELLAR_SETTINGS',
      value: stellarValue,
      isPrivate: false,
    });
  } catch (error) {
    const stellarValue = {
      tenantName: 'sandab',
      server: 'https://soroban-testnet.stellar.org',
      keypair: 'SAKQYFOKZFZI2LDGNMMWN3UQA6JP4F3JVUEDHVUYYWHCVQIE764WTGBU',
      email: 'owner@sandab.stellar.rahat.io',
      password: 'Password123!',
      contractId: 'CAS57GSDGERUYREBA47G4AKPWTNOQRQDXQQBMAT3JXGGKEOTNDGI7AI7',
      vendorAddress: 'GBNYMT3TSPAV5BMPW6QNRZYXN5U3BMDAZE54O7AWGIIZ5CUDIA7RYAEB',
    };

    await settings.create({
      name: 'STELLAR_SETTINGS',
      value: stellarValue,
      isPrivate: false,
    });
  }
};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.log(error);
    await prisma.$disconnect();
  });

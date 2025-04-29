
import { PrismaService } from '@rumsan/prisma';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from '@rumsan/settings';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const settings = new SettingsService(prismaService);


const main = async () => {
  const stellarValue = {
    tenantName: 'sandab',
    server: 'https://soroban-testnet.stellar.org',
    keypair: 'SAKQYFOKZFZI2LDGNMMWN3UQA6JP4F3JVUEDHVUYYWHCVQIE764WTGBU',
    email: 'owner@sandab.stellar.rahat.io',
    password: 'Password123!',
  };

  await settings.create({
    name: 'STELLAR_SETTINGS',
    value: stellarValue,
    isPrivate: false,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.log(error);
    await prisma.$disconnect();
  });

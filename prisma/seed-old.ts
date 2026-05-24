import { PrismaService } from '@rumsan/prisma';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from '@rumsan/settings';

// Import main functions from other seed files
import { seedProject } from './seed-project';
import { seedStellar } from './seed-stellar';
import { seedOfframp } from './seed-offramp';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const settings = new SettingsService(prismaService);
const scb_base_url = process.env['SCB_BASE_URL'];
const scb_access_token = process.env['SCB_ACCESS_TOKEN'];

const main = async () => {
  // Run base seed operations
  await settings.create({
    name: 'HAZARD_TYPE',
    value: 'River Flood',
    isPrivate: false,
  });

  await settings.create({
    name: 'SCB',
    value: { baseUrl: scb_base_url, accessToken: scb_access_token },
    isPrivate: false,
  });

  // Run project and stellar seed operations sequentially
  console.log('Running project seed...');
  await seedProject();

  console.log('Running stellar seed...');
  await seedStellar();

  console.log('Running payment provider seed...');
  await seedOfframp();

  console.log('All seed operations completed successfully');
};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.log(error);
    await prisma.$disconnect();
  });

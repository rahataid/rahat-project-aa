import { PrismaService } from '@rumsan/prisma';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from '@rumsan/settings';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const settings = new SettingsService(prismaService);

export const seedSubgraph = async () => {
  const subgraphUrl =
    'https://subgraph.satsuma-prod.com/rumsan--43584/aa-unicef-evm-dev/playground';

  try {
    const existingSetting = await settings.getPublic('SUBGRAPH_URL');

    if (existingSetting) {
      console.log('SUBGRAPH_URL setting already exists');
      await settings.delete('SUBGRAPH_URL');
      console.log('Old SUBGRAPH_URL setting deleted');
    }

    await settings.update('SUBGRAPH_URL', {
      value: subgraphUrl,
      isPrivate: false,
    });

    console.log('SUBGRAPH_URL setting created successfully');
  } catch (error) {
    await settings.create({
      name: 'SUBGRAPH_URL',
      value: subgraphUrl,
      isPrivate: false,
    });
    console.log('SUBGRAPH_URL setting created successfully');
  }
};

// Keep the standalone execution capability for when run directly
if (require.main === module) {
  seedSubgraph()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('Failed to seed subgraph settings:', error);
      await prisma.$disconnect();
      process.exit(1);
    });
}

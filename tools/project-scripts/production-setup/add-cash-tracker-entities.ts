import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma';
import * as dotenv from 'dotenv';
// Load environment variables from .env.setup if it exists, otherwise fallback to .env
dotenv.config({ path: `${__dirname}/.env.setup` });
dotenv.config(); // Fallback to default .env

import entities from './entities.json';

const prisma = new PrismaService();
const settings = new SettingsService(prisma);

class DeploymentUpdater {
  public async addCashTrackerEntities() {
    console.log('CashTracker Entities adding');
    await settings.create({
      name: 'ENTITIES',
      value: entities,
      isPrivate: false,
    });
    console.log('CashTracker Entities added');
  }
}
async function main() {
  const cashTrackerEntities = new DeploymentUpdater();

  await cashTrackerEntities.addCashTrackerEntities();

  process.exit(0);
}
main();

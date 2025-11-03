import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma';
import * as dotenv from 'dotenv';
dotenv.config({ path: `${__dirname}/.env.setup` });

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

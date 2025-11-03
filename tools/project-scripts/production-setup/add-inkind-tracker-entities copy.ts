import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma';
import * as dotenv from 'dotenv';
dotenv.config({ path: `${__dirname}/.env.setup` });

import entities from './entities.json';

const prisma = new PrismaService();
const settings = new SettingsService(prisma);

class DeploymentUpdater {
  public async addInkindTrackerEntities() {
    console.log('Inkind Tracker Entities adding');
    await settings.create({
      name: 'ENTITIES',
      value: entities,
      isPrivate: false,
    });
    console.log('Inkind Tracker Entities added');
  }
}
async function main() {
  const cashTrackerEntities = new DeploymentUpdater();

  await cashTrackerEntities.addInkindTrackerEntities();

  process.exit(0);
}
main();

import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma';
import * as dotenv from 'dotenv';
// Load environment variables from .env.setup if it exists, otherwise fallback to .env
dotenv.config({ path: `${__dirname}/.env.setup` });
dotenv.config(); // Fallback to default .env

const subgraphUrl = process.env.SUBGRAPH_QUERY_URL as string;

const prisma = new PrismaService();
const settings = new SettingsService(prisma);

class DeploymentUpdater {
  projectUUID: string;

  constructor() {
    this.projectUUID = process.env.PROJECT_UUID as string;
  }

  public async addGraphSettings() {
    console.log('CashTracker Subgraph url adding');
    await settings.create({
      name: 'CASHTRACKER_SUBGRAPH_URL',
      value: {
        URL: subgraphUrl,
      },
      isPrivate: false,
    });
    console.log('CashTracker Subgraph url added');
  }
}
async function main() {
  const deploymentUpdater = new DeploymentUpdater();

  await deploymentUpdater.addGraphSettings();

  process.exit(0);
}
main();

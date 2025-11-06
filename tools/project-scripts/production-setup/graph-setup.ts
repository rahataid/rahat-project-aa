/**
 * Graph Setup Pipeline Helper
 * Wrapper script to run graph setup commands
 */
import * as dotenv from 'dotenv';
import { StateManager } from './services/_state-manager';
import { configureGraphNetworks } from './commands/configure-graph-networks';
import { deploySubgraph } from './commands/deploy-subgraph';

// Load environment variables
dotenv.config({ path: `${__dirname}/.env.setup` });
dotenv.config();

async function main() {
  const projectUUID = process.env.PROJECT_UUID;
  if (!projectUUID) {
    console.error('❌ PROJECT_UUID environment variable is required');
    process.exit(1);
  }

  try {
    const stateManager = new StateManager(projectUUID);

    console.log('📝 Configuring graph networks...');
    await configureGraphNetworks({ projectUUID }, stateManager);

    console.log('🚀 Deploying subgraph...');
    await deploySubgraph({ projectUUID }, stateManager);

    console.log('✅ Graph setup completed successfully');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Graph setup failed:', error.message);
    process.exit(1);
  }
}

main();

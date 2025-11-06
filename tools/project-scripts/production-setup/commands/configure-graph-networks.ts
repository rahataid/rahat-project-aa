/**
 * Configure Graph Networks Command
 * Updates networks.json with deployed contract addresses
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../services/_logger';
import { StateManager } from '../services/_state-manager';
import { DeploymentStore } from '../services/_deployment-store';

export interface ConfigureGraphNetworksCommandInput {
  projectUUID: string;
}

export class ConfigureGraphNetworksCommand {
  private deploymentStore: DeploymentStore;
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.deploymentStore = new DeploymentStore();
    this.stateManager = stateManager;
  }

  /**
   * Execute graph networks configuration
   */
  async execute(command: ConfigureGraphNetworksCommandInput): Promise<void> {
    Logger.setStep('configure-graph-networks');
    Logger.info('Configuring graph networks.json');

    // Check if already completed
    const isCompleted = await this.stateManager.isStepCompleted(
      'configure-graph-networks'
    );
    if (isCompleted) {
      Logger.warn('Graph networks already configured, skipping...');
      return;
    }

    try {
      const networkName =
        process.env.SUBGRAPH_NETWORK || process.env.CHAIN_NAME || 'mainnet';

      // Load deployment data
      const deploymentData = await this.deploymentStore.load(
        command.projectUUID
      );
      if (!deploymentData || !deploymentData.CONTRACTS) {
        throw new Error('Deployment data not found');
      }

      // Path from commands/ directory: commands -> production-setup -> project-scripts -> tools -> rahat-project-aa -> apps/graph
      const graphNetworksPath = path.join(
        __dirname,
        '../../../../apps/graph/networks.json'
      );
      const graphNetworksDir = path.dirname(graphNetworksPath);

      // Ensure the directory exists
      try {
        await fs.mkdir(graphNetworksDir, { recursive: true });
      } catch (error: any) {
        if (error.code !== 'EEXIST') {
          throw new Error(`Failed to create graph directory: ${error.message}`);
        }
      }

      // Read existing networks.json
      let networks: Record<string, any> = {};
      try {
        const networksData = await fs.readFile(graphNetworksPath, 'utf8');
        networks = JSON.parse(networksData);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          Logger.warn('networks.json not found, creating new file');
        } else {
          throw error;
        }
      }

      // Update with new addresses
      const newNetworksData = {
        ...networks,
        [networkName]: deploymentData.CONTRACTS,
      };

      // Write updated networks.json
      await fs.writeFile(
        graphNetworksPath,
        JSON.stringify(newNetworksData, null, 2),
        'utf-8'
      );

      Logger.success(`Updated networks.json with ${networkName} network`);
      await this.stateManager.markStepComplete('configure-graph-networks');
    } catch (error: any) {
      await this.stateManager.markStepFailed('configure-graph-networks', error);
      throw error;
    } finally {
      Logger.clearStep();
    }
  }
}

/**
 * Helper function to configure graph networks
 */
export async function configureGraphNetworks(
  command: ConfigureGraphNetworksCommandInput,
  stateManager: StateManager
): Promise<void> {
  const cmd = new ConfigureGraphNetworksCommand(stateManager);
  return await cmd.execute(command);
}

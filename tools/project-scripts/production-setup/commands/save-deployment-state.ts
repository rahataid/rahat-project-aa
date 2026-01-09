/**
 * Save Deployment State Command
 * Saves deployment data to deployment file
 */
import { Logger } from '../services/_logger';
import { StateManager } from '../services/_state-manager';
import { DeploymentStore, DeploymentFile } from '../services/_deployment-store';
import { DeployAllContractsResult } from './deploy-contracts';

export interface SaveDeploymentStateCommandInput {
  projectUUID: string;
  deployedContracts: DeployAllContractsResult;
}

export class SaveDeploymentStateCommand {
  private deploymentStore: DeploymentStore;
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.deploymentStore = new DeploymentStore();
    this.stateManager = stateManager;
  }

  /**
   * Execute saving deployment state
   */
  async execute(command: SaveDeploymentStateCommandInput): Promise<void> {
    Logger.setStep('save-deployment-state');
    Logger.info('Saving deployment state to file');

    // Check if already completed
    const isCompleted = await this.stateManager.isStepCompleted(
      'save-deployment-state'
    );
    if (isCompleted) {
      Logger.warn('Deployment state already saved, skipping...');
      return;
    }

    try {
      // Backup existing deployment file if it exists
      if (this.deploymentStore.exists(command.projectUUID)) {
        await this.deploymentStore.backup(command.projectUUID);
      }

      // Prepare deployment data
      const contracts: Record<string, { address: string; startBlock: number }> =
        {};
      for (const [name, contract] of Object.entries(
        command.deployedContracts.contracts
      )) {
        contracts[name] = {
          address: contract.address,
          startBlock: contract.blockNumber,
        };
      }

      const deploymentData: DeploymentFile = {
        CONTRACTS: contracts,
        deployedAt: new Date().toISOString(),
        network: process.env.CHAIN_NAME || 'unknown',
      };

      // Save to deployment file
      await this.deploymentStore.save(command.projectUUID, deploymentData);

      await this.stateManager.markStepComplete('save-deployment-state');
      Logger.success('Deployment state saved successfully');
    } catch (error: any) {
      await this.stateManager.markStepFailed('save-deployment-state', error);
      throw error;
    } finally {
      Logger.clearStep();
    }
  }
}

/**
 * Helper function to save deployment state
 */
export async function saveDeploymentState(
  command: SaveDeploymentStateCommandInput,
  stateManager: StateManager
): Promise<void> {
  const cmd = new SaveDeploymentStateCommand(stateManager);
  return await cmd.execute(command);
}

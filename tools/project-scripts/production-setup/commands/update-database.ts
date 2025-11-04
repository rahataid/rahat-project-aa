/**
 * Update Database Command
 * Updates database with deployed contracts and settings
 */
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import { Logger } from '../services/_logger';
import { StateManager } from '../services/_state-manager';
import { DeploymentStore } from '../services/_deployment-store';
import { ContractLib } from '../_common';

export interface UpdateDatabaseCommandInput {
  projectUUID: string;
}

export class UpdateDatabaseCommand {
  private prisma: PrismaService;
  private settings: SettingsService;
  private contractLib: ContractLib;
  private deploymentStore: DeploymentStore;
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.prisma = new PrismaService();
    this.settings = new SettingsService(this.prisma);
    this.contractLib = new ContractLib();
    this.deploymentStore = new DeploymentStore();
    this.stateManager = stateManager;
  }

  /**
   * Execute database update
   */
  async execute(command: UpdateDatabaseCommandInput): Promise<void> {
    Logger.setStep('update-database');
    Logger.info('Updating database with deployment info');

    // Check if already completed
    const isCompleted = await this.stateManager.isStepCompleted('update-database');
    if (isCompleted) {
      Logger.warn('Database already updated, skipping...');
      return;
    }

    try {
      // Load deployment data
      const deploymentData = await this.deploymentStore.load(command.projectUUID);
      if (!deploymentData || !deploymentData.CONTRACTS) {
        throw new Error('Deployment data not found');
      }

      const contractNames = ['AAProject', 'RahatDonor', 'RahatToken'];

      // 1. Add contract settings
      Logger.info('Adding contract settings to database');
      const contractDetails: Record<string, { address: string; abi: any }> = {};
      
      for (const contractName of contractNames) {
        const contractData = deploymentData.CONTRACTS[contractName];
        if (!contractData) {
          Logger.warn(`Contract ${contractName} not found in deployment data`);
          continue;
        }

        const { abi } = this.contractLib.getContractArtifacts(contractName);
        contractDetails[contractName] = {
          address: contractData.address,
          abi,
        };
      }

      if (Object.keys(contractDetails).length > 0) {
        await this.settings.create({
          name: 'CONTRACT',
          value: contractDetails,
          isPrivate: false,
        });

        await this.settings.create({
          name: 'CONTRACTS',
          value: contractDetails,
          isPrivate: false,
        });
        Logger.success('Contract settings added');
      }

      // 2. Add blockchain settings
      Logger.info('Adding blockchain settings');
      const network = this.contractLib.getNetworkSettings();
      await this.settings.create({
        name: 'BLOCKCHAIN',
        value: network,
        isPrivate: false,
      });
      Logger.success('Blockchain settings added');

      // 3. Add chain settings
      Logger.info('Adding chain settings');
      const chainData = {
        name: process.env.CHAIN_NAME,
        type: process.env.CHAIN_TYPE,
        rpcUrl: process.env.CHAIN_RPCURL,
        chainId: process.env.CHAIN_ID,
        currency: {
          name: process.env.CHAIN_CURRENCY_NAME,
          symbol: process.env.CHAIN_CURRENCY_SYMBOL,
        },
        explorerUrl: process.env.CHAIN_EXPLORER_URL,
      };

      await this.settings.create({
        name: 'CHAIN_SETTINGS',
        value: chainData,
        isPrivate: false,
      });
      Logger.success('Chain settings added');

      await this.stateManager.markStepComplete('update-database');
      Logger.success('Database updated successfully');
    } catch (error: any) {
      await this.stateManager.markStepFailed('update-database', error);
      throw error;
    } finally {
      Logger.clearStep();
    }
  }
}

/**
 * Helper function to update database
 */
export async function updateDatabase(
  command: UpdateDatabaseCommandInput,
  stateManager: StateManager
): Promise<void> {
  const cmd = new UpdateDatabaseCommand(stateManager);
  return await cmd.execute(command);
}


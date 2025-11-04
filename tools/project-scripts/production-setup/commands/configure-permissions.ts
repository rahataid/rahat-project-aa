/**
 * Configure Permissions Command
 * Sets up contract permissions after deployment
 */
import { Wallet } from 'ethers';
import { ContractLib } from '../_common';
import { Logger } from '../services/_logger';
import { SecretsManager } from '../services/_secrets-manager';
import { StateManager } from '../services/_state-manager';
import { DeployAllContractsResult } from './deploy-contracts';
import axios from 'axios';

export interface ConfigurePermissionsCommandInput {
  deployedContracts: DeployAllContractsResult;
  projectUUID: string;
}

export class ConfigurePermissionsCommand {
  private contractLib: ContractLib;
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.contractLib = new ContractLib();
    this.stateManager = stateManager;
  }

  /**
   * Fetch core contracts
   */
  private async fetchCoreContracts(): Promise<{
    RahatAccessManager: string;
  }> {
    const url = `${process.env.RAHAT_CORE_URL}/v1/settings/CONTRACTS`;
    const { data } = await axios.get(url);
    const contractDetails = data?.data;

    return {
      RahatAccessManager: contractDetails.value.RAHATACCESSMANAGER.address,
    };
  }

  /**
   * Execute permission configuration
   */
  async execute(command: ConfigurePermissionsCommandInput): Promise<void> {
    Logger.setStep('configure-permissions');
    Logger.info('Configuring contract permissions');

    // Check if already completed
    const isCompleted = await this.stateManager.isStepCompleted('configure-permissions');
    if (isCompleted) {
      Logger.warn('Permissions already configured, skipping...');
      return;
    }

    try {
      const coreContracts = await this.fetchCoreContracts();
      const deployerKey = await SecretsManager.getDeployerPrivateKey();
      const deployerAccount = this.contractLib.getWalletFromPrivateKey(deployerKey);

      const { deployedContracts } = command;

      // Wait for transactions to settle
      Logger.info('Waiting for transactions to settle...');
      await this.contractLib.delay(20000);

      // 1. Add donor contract as admin in AA Project
      Logger.info('Granting admin role to RahatDonor in AAProject');
      try {
        await this.contractLib.callContractMethod(
          'RahatAccessManager',
          'grantRole',
          [0, deployedContracts.contracts.RahatDonor.address, 0],
          coreContracts.RahatAccessManager,
          deployerAccount
        );
        Logger.success('Admin role granted to RahatDonor');
      } catch (error: any) {
        Logger.warn('Failed to grant role to RahatDonor. This may require manual admin setup.');
        Logger.warn('Error:', error.message);
        // Continue - this might need to be done manually by Rahat Core admin
      }

      // 2. Register project in donor
      Logger.info('Registering project in RahatDonor');
      try {
        await this.contractLib.callContractMethod(
          'RahatDonor',
          'registerProject',
          [deployedContracts.contracts.AAProject.address, true],
          deployedContracts.contracts.RahatDonor.address,
          deployerAccount
        );
        Logger.success('Project registered in RahatDonor');
      } catch (error: any) {
        Logger.error('Failed to register project in RahatDonor', error);
        // This is critical, so we should fail
        throw error;
      }

      // 3. Add deployer address as admin
      Logger.info('Granting admin role to deployer address');
      try {
        await this.contractLib.callContractMethod(
          'RahatAccessManager',
          'grantRole',
          [0, deployerAccount.address, 0],
          coreContracts.RahatAccessManager,
          deployerAccount
        );
        Logger.success('Admin role granted to deployer');
      } catch (error: any) {
        Logger.warn('Failed to grant role to deployer. This may require manual admin setup.');
        Logger.warn('Error:', error.message);
        // Continue - this might need to be done manually by Rahat Core admin
      }

      await this.stateManager.markStepComplete('configure-permissions');
      Logger.success('Permissions configured successfully');
    } catch (error: any) {
      await this.stateManager.markStepFailed('configure-permissions', error);
      throw error;
    } finally {
      Logger.clearStep();
    }
  }
}

/**
 * Helper function to configure permissions
 */
export async function configurePermissions(
  command: ConfigurePermissionsCommandInput,
  stateManager: StateManager
): Promise<void> {
  const cmd = new ConfigurePermissionsCommand(stateManager);
  return await cmd.execute(command);
}


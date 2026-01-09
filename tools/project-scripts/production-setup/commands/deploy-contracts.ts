/**
 * Deploy All Contracts Command
 * Orchestrates deployment of all required contracts
 */
import axios from 'axios';
import { Wallet } from 'ethers';
import { ContractLib } from '../_common';
import { DeployedContract } from '../../types/blockchain';
import { Logger } from '../services/_logger';
import { SecretsManager } from '../services/_secrets-manager';
import { StateManager } from '../services/_state-manager';
import {
  deploySingleContract,
  DeployContractCommand,
  DeployedContractResult,
} from './deploy-single-contract';

export interface DeployAllContractsResult {
  contracts: Record<string, DeployedContractResult>;
  coreContracts: {
    RahatAccessManager: string;
    ERC2771Forwarder: string;
    RahatTreasury: string;
  };
}

export class DeployAllContractsCommand {
  private contractLib: ContractLib;
  private stateManager: StateManager;
  private projectUUID: string;

  constructor(projectUUID: string, stateManager: StateManager) {
    this.contractLib = new ContractLib();
    this.stateManager = stateManager;
    this.projectUUID = projectUUID;
  }

  /**
   * Fetch core contracts from Rahat Core API
   */
  private async fetchCoreContracts(): Promise<{
    RahatAccessManager: string;
    ERC2771Forwarder: string;
    RahatTreasury: string;
  }> {
    Logger.info('Fetching core contracts from Rahat Core');

    const url = `${process.env.RAHAT_CORE_URL}/v1/settings/CONTRACTS`;
    const { data } = await axios.get(url);
    const contractDetails = data?.data;

    if (!contractDetails?.value) {
      throw new Error('Failed to fetch core contracts from Rahat Core');
    }

    const coreContracts = {
      RahatAccessManager:
        contractDetails.value.RAHATACCESSMANAGER.address,
      ERC2771Forwarder: contractDetails.value.ERC2771FORWARDER.address,
      RahatTreasury: contractDetails.value.RAHATTREASURY.address,
    };

    Logger.success('Core contracts fetched');
    Logger.debug('Core contracts', {
      RahatAccessManager: SecretsManager.mask(String(coreContracts.RahatAccessManager)),
      ERC2771Forwarder: SecretsManager.mask(String(coreContracts.ERC2771Forwarder)),
      RahatTreasury: SecretsManager.mask(String(coreContracts.RahatTreasury)),
    });

    return coreContracts;
  }

  /**
   * Execute deployment of all contracts
   */
  async execute(): Promise<DeployAllContractsResult> {
    Logger.setStep('deploy-contracts');
    Logger.info('Starting contract deployment');

    // Check if already deployed
    const isCompleted = await this.stateManager.isStepCompleted('deploy-contracts');
    if (isCompleted) {
      Logger.warn('Contracts already deployed, skipping...');
      const state = await this.stateManager.load();
      if (state?.deployedContracts) {
        // Reconstruct result from state
        const contracts: Record<string, DeployedContractResult> = {};
        for (const [name, data] of Object.entries(state.deployedContracts)) {
          contracts[name] = {
            contractName: name,
            address: data.address,
            blockNumber: data.blockNumber,
            contract: null as any, // Contract instance not stored in state
          };
        }
        return {
          contracts,
          coreContracts: state.metadata?.coreContracts || {},
        };
      }
    }

    try {
      // Fetch core contracts
      const coreContracts = await this.fetchCoreContracts();

      // Get deployer key
      const deployerKey = await SecretsManager.getDeployerPrivateKey();
      const deployerAccount = this.contractLib.getWalletFromPrivateKey(deployerKey);
      Logger.debug('Deployer account', {
        address: deployerAccount.address,
      });

      // Deploy contracts in order
      const deployedContracts: Record<string, DeployedContractResult> = {};

      // 1. TriggerManager
      Logger.info('Deploying TriggerManager...');
      const triggerManager = await deploySingleContract({
        contractName: 'TriggerManager',
        constructorArgs: [2],
        deployerKey,
      });
      deployedContracts.TriggerManager = triggerManager;
      await this.stateManager.addDeployedContract(
        'TriggerManager',
        triggerManager.address,
        triggerManager.blockNumber
      );

      // 2. RahatDonor
      Logger.info('Deploying RahatDonor...');
      const rahatDonor = await deploySingleContract({
        contractName: 'RahatDonor',
        constructorArgs: [deployerAccount.address, coreContracts.RahatAccessManager],
        deployerKey,
      });
      deployedContracts.RahatDonor = rahatDonor;
      await this.stateManager.addDeployedContract(
        'RahatDonor',
        rahatDonor.address,
        rahatDonor.blockNumber
      );

      // 3. RahatToken
      Logger.info('Deploying RahatToken...');
      const rahatToken = await deploySingleContract({
        contractName: 'RahatToken',
        constructorArgs: [
          coreContracts.ERC2771Forwarder,
          'RahatToken',
          'RHT',
          rahatDonor.address,
          1,
        ],
        deployerKey,
      });
      deployedContracts.RahatToken = rahatToken;
      await this.stateManager.addDeployedContract(
        'RahatToken',
        rahatToken.address,
        rahatToken.blockNumber
      );

      // 4. AAProject
      Logger.info('Deploying AAProject...');
      const aaProject = await deploySingleContract({
        contractName: 'AAProject',
        constructorArgs: [
          'AAProject',
          rahatToken.address,
          coreContracts.ERC2771Forwarder,
          coreContracts.RahatAccessManager,
          triggerManager.address,
        ],
        deployerKey,
      });
      deployedContracts.AAProject = aaProject;
      await this.stateManager.addDeployedContract(
        'AAProject',
        aaProject.address,
        aaProject.blockNumber
      );

      // 5. CashToken
      Logger.info('Deploying CashToken...');
      const cashToken = await deploySingleContract({
        contractName: 'CashToken',
        constructorArgs: [
          'CashToken',
          'CASH',
          1,
          100000,
          rahatDonor.address,
        ],
        deployerKey,
      });
      deployedContracts.CashToken = cashToken;
      await this.stateManager.addDeployedContract(
        'CashToken',
        cashToken.address,
        cashToken.blockNumber
      );

      // Mark step as complete
      await this.stateManager.markStepComplete('deploy-contracts', {
        coreContracts,
      });

      Logger.success('All contracts deployed successfully');

      return {
        contracts: deployedContracts,
        coreContracts,
      };
    } catch (error: any) {
      await this.stateManager.markStepFailed('deploy-contracts', error);
      throw error;
    } finally {
      Logger.clearStep();
    }
  }
}

/**
 * Helper function to deploy all contracts
 */
export async function deployAllContracts(
  projectUUID: string,
  stateManager: StateManager
): Promise<DeployAllContractsResult> {
  const cmd = new DeployAllContractsCommand(projectUUID, stateManager);
  return await cmd.execute();
}


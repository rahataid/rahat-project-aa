/**
 * Deploy Single Contract Command
 * Deploys one contract and returns deployment info
 */
import { ContractLib } from '../_common';
import { DeployedContract } from '../../types/blockchain';
import { Logger } from '../services/_logger';
import { SecretsManager } from '../services/_secrets-manager';

export interface DeployContractCommand {
  contractName: string;
  constructorArgs: any[];
  deployerKey: string;
}

export interface DeployedContractResult {
  contractName: string;
  address: string;
  blockNumber: number;
  contract: any; // ethers.Contract instance
}

export class DeploySingleContractCommand {
  private contractLib: ContractLib;

  constructor() {
    this.contractLib = new ContractLib();
  }

  async execute(
    command: DeployContractCommand
  ): Promise<DeployedContractResult> {
    Logger.setStep(`deploy-${command.contractName.toLowerCase()}`);
    Logger.info(`Deploying contract: ${command.contractName}`);

    try {
      const result = await this.contractLib.deployContract(
        command.contractName,
        command.constructorArgs,
        command.deployerKey
      );

      const deployedContract: DeployedContractResult = {
        contractName: command.contractName,
        address: String(result.contract.target),
        blockNumber: result.blockNumber,
        contract: result.contract,
      };

      Logger.success(
        `Contract deployed: ${command.contractName} at ${deployedContract.address}`
      );
      Logger.debug(`Deployment details`, {
        blockNumber: deployedContract.blockNumber,
        address: deployedContract.address,
      });

      return deployedContract;
    } catch (error: any) {
      Logger.error(`Failed to deploy contract: ${command.contractName}`, error);
      throw error;
    } finally {
      Logger.clearStep();
    }
  }
}

/**
 * Helper function to deploy a single contract
 */
export async function deploySingleContract(
  command: DeployContractCommand
): Promise<DeployedContractResult> {
  const cmd = new DeploySingleContractCommand();
  return await cmd.execute(command);
}

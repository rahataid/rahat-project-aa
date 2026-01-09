import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import axios from 'axios';
import { Wallet } from 'ethers';
import * as dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
// Load environment variables from .env.setup if it exists, otherwise fallback to .env
dotenv.config({ path: `${__dirname}/.env.setup` });
dotenv.config({ path: `${__dirname}/.env.prod` });
dotenv.config(); // Fallback to default .env

interface DeploymentFile {
  CONTRACTS: Record<string, { address: string; startBlock: number }>;
  deployedAt?: string;
  network?: string;
  chainSettings?: any;
  subgraphUrl?: string | { url: string };
}

function getDeploymentFile(projectUUID: string): DeploymentFile | null {
  const directoryPath = join(__dirname, 'deployments');
  const fileName = `${projectUUID}.json`;
  const filePath = join(directoryPath, fileName);

  if (existsSync(filePath)) {
    const contents = readFileSync(filePath, 'utf8');
    return JSON.parse(contents);
  } else {
    console.log(`File ${fileName} does not exist in ${directoryPath}`);
    return null;
  }
}

const contractNames = ['AAProject', 'RahatDonor', 'RahatToken'];

const prisma = new PrismaService();
const settings = new SettingsService(prisma);

class DeploymentUpdater {
  deploymentSettings: DeploymentFile | null;
  projectUUID: string;

  constructor(projectUUID: string) {
    this.projectUUID = projectUUID;
    this.deploymentSettings = getDeploymentFile(projectUUID);
    if (!this.deploymentSettings) {
      throw new Error(`Deployment file not found for project: ${projectUUID}`);
    }
  }

  private async getContractArtifacts(contractName: string) {
    const contract = require(`../contracts/${contractName}.json`);
    return contract;
  }

  private async getDeployedContractDetails(contractNames: string[]) {
    if (!this.deploymentSettings?.CONTRACTS) {
      throw new Error('CONTRACTS not found in deployment file');
    }

    const contractDetails: Record<string, { address: string; abi: any }> = {};

    await Promise.all(
      contractNames.map(async (contractName) => {
        const contractData = this.deploymentSettings!.CONTRACTS[contractName];
        if (!contractData) {
          console.warn(`Contract ${contractName} not found in deployment file`);
          return;
        }
        const { abi } = await this.getContractArtifacts(contractName);
        contractDetails[contractName] = {
          address: contractData.address,
          abi,
        };
      })
    );
    return contractDetails;
  }

  public async addContractSettings() {
    console.log('Adding contract settings to database');

    const contracts = await this.getDeployedContractDetails(contractNames);

    // Filter out undefined contracts
    const validContracts = Object.fromEntries(
      Object.entries(contracts).filter(([_, value]) => value !== undefined)
    );

    if (Object.keys(validContracts).length === 0) {
      console.warn('No valid contracts found to add');
      return;
    }

    const data = {
      name: 'CONTRACT',
      value: validContracts,
      isPrivate: false,
    };

    const data2 = {
      name: 'CONTRACTS',
      value: validContracts,
      isPrivate: false,
    };

    try {
      await settings.create(data);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log('CONTRACT setting already exists, skipping...');
      } else {
        throw error;
      }
    }

    try {
      await settings.create(data2);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log('CONTRACTS setting already exists, skipping...');
      } else {
        throw error;
      }
    }

    console.log('Contract settings added successfully');
  }

  public async addBlockchainSettings() {
    console.log('Adding Blockchain settings');

    // Use getNetworkSettings() format like old flow, but transform to match DB format
    const networkSettings = {
      RPCURL: process.env.CHAIN_RPCURL || '',
      CHAINNAME: process.env.CHAIN_NAME || '',
      NATIVECURRENCY: {
        NAME: process.env.CHAIN_CURRENCY_NAME || 'ETH',
        SYMBOL: process.env.CHAIN_CURRENCY_SYMBOL || 'ETH',
      },
    };

    const data = {
      name: 'BLOCKCHAIN',
      value: networkSettings,
      isPrivate: false,
    };

    try {
      await settings.create(data);
      console.log('Blockchain settings added successfully');
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log('BLOCKCHAIN setting already exists, skipping...');
      } else {
        throw error;
      }
    }
  }

  public async addChainSettings() {
    console.log('Adding Chain settings');

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

    const data = {
      name: 'CHAIN_SETTINGS',
      value: chainData,
      isPrivate: false,
    };

    try {
      await settings.create(data);
      console.log('Chain settings added successfully');
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log('CHAIN_SETTINGS setting already exists, skipping...');
      } else {
        throw error;
      }
    }
  }

  public async addGraphSettings() {
    console.log('Adding Subgraph URL settings');

    if (!this.deploymentSettings?.subgraphUrl) {
      const subgraphUrl = process.env.SUBGRAPH_QUERY_URL;
      if (!subgraphUrl) {
        console.warn(
          'Subgraph URL not found in deployment file or environment variables'
        );
        return;
      }

      // Add CASHTRACKER_SUBGRAPH_URL
      const data = {
        name: 'CASHTRACKER_SUBGRAPH_URL',
        value: {
          URL: subgraphUrl,
        },
        isPrivate: false,
      };
      try {
        await settings.create(data);
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          console.log(
            'CASHTRACKER_SUBGRAPH_URL setting already exists, skipping...'
          );
        } else {
          throw error;
        }
      }

      // Add SUBGRAPH_URL (main subgraph)
      const data2 = {
        name: 'SUBGRAPH_URL',
        value: {
          URL: subgraphUrl,
        },
        isPrivate: false,
      };
      try {
        await settings.create(data2);
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          console.log('SUBGRAPH_URL setting already exists, skipping...');
        } else {
          throw error;
        }
      }
    } else {
      const subgraphUrl =
        typeof this.deploymentSettings.subgraphUrl === 'string'
          ? this.deploymentSettings.subgraphUrl
          : this.deploymentSettings.subgraphUrl.url;

      // Add CASHTRACKER_SUBGRAPH_URL
      const data = {
        name: 'CASHTRACKER_SUBGRAPH_URL',
        value: {
          URL: subgraphUrl,
        },
        isPrivate: false,
      };
      try {
        await settings.create(data);
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          console.log(
            'CASHTRACKER_SUBGRAPH_URL setting already exists, skipping...'
          );
        } else {
          throw error;
        }
      }

      // Add SUBGRAPH_URL (main subgraph)
      const data2 = {
        name: 'SUBGRAPH_URL',
        value: {
          URL: subgraphUrl,
        },
        isPrivate: false,
      };
      try {
        await settings.create(data2);
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          console.log('SUBGRAPH_URL setting already exists, skipping...');
        } else {
          throw error;
        }
      }
    }
    console.log('Subgraph URL settings added successfully');
  }

  public async addAdminSettings() {
    console.log('Adding Admin settings');

    const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!deployerKey) {
      console.warn('DEPLOYER_PRIVATE_KEY not found in environment variables');
      return;
    }

    const deployerWallet = new Wallet(deployerKey);
    const adminAddress = deployerWallet.address;

    // Add ADMIN setting
    const adminData = {
      name: 'ADMIN',
      value: {
        ADDRESS: adminAddress,
      },
      isPrivate: false,
    };
    try {
      await settings.create(adminData);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log('ADMIN setting already exists, skipping...');
      } else {
        throw error;
      }
    }

    // Add DEPLOYER_PRIVATE_KEY (as private)
    const deployerData = {
      name: 'DEPLOYER_PRIVATE_KEY',
      value: deployerKey,
      isPrivate: true,
    };
    try {
      await settings.create(deployerData);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log('DEPLOYER_PRIVATE_KEY setting already exists, skipping...');
      } else {
        throw error;
      }
    }

    // Add RAHAT_ADMIN_PRIVATE_KEY (as private)
    const rahatAdminData = {
      name: 'RAHAT_ADMIN_PRIVATE_KEY',
      value: deployerKey,
      isPrivate: true,
    };
    try {
      await settings.create(rahatAdminData);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log(
          'RAHAT_ADMIN_PRIVATE_KEY setting already exists, skipping...'
        );
      } else {
        throw error;
      }
    }

    console.log('Admin settings added successfully');
  }

  public async addCashTokenContract() {
    console.log('Adding CashToken contract setting');

    if (!this.deploymentSettings?.CONTRACTS?.CashToken) {
      console.warn('CashToken contract not found in deployment file');
      return;
    }

    const cashTokenAddress =
      this.deploymentSettings.CONTRACTS.CashToken.address;

    const data = {
      name: 'CASH_TOKEN_CONTRACT',
      value: cashTokenAddress,
      isPrivate: false,
    };

    try {
      await settings.create(data);
      console.log('CashToken contract setting added successfully');
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log('CASH_TOKEN_CONTRACT setting already exists, skipping...');
      } else {
        throw error;
      }
    }
  }

  public async addEntryPoint() {
    console.log('Adding Entry Point setting');

    // Entry Point address for Account Abstraction (fixed address)
    const entryPointAddress =
      process.env.ENTRY_POINT || '0x1e2717BC0dcE0a6632fe1B057e948ec3EF50E38b';

    const data = {
      name: 'ENTRY_POINT',
      value: entryPointAddress,
      isPrivate: false,
    };

    try {
      await settings.create(data);
      console.log('Entry Point setting added successfully');
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log('ENTRY_POINT setting already exists, skipping...');
      } else {
        throw error;
      }
    }
  }
}

async function main() {
  const projectUUID = process.env.PROJECT_UUID;

  if (!projectUUID) {
    console.error('PROJECT_UUID environment variable is required');
    process.exit(1);
  }

  try {
    const deploymentUpdater = new DeploymentUpdater(projectUUID);

    await deploymentUpdater.addContractSettings();
    await deploymentUpdater.addBlockchainSettings();
    await deploymentUpdater.addChainSettings();
    await deploymentUpdater.addGraphSettings();
    await deploymentUpdater.addAdminSettings();
    await deploymentUpdater.addCashTokenContract();
    await deploymentUpdater.addEntryPoint();

    console.log('✅ Deployment update completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating deployment:', error);
    process.exit(1);
  }
}

main();

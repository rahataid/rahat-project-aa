import * as dotenv from 'dotenv';
import { commonLib } from './_common';
import axios from 'axios';
import { DeployedContract } from '../types/blockchain';
import { Wallet } from 'ethers';
dotenv.config({ path: `${__dirname}/.env.prod` });

//RAHAT_ADMIN_PRIVATE_KEY
//BLOCKCHAIN
//SUBGRAPH_URL

const rahatTokenDetails = {
  name: 'RHT Coin',
  symbol: 'RHT',
  description: 'RHT Coin',
  decimals: 0,
  initialSupply: '100000',
};

class DeploymentSetup extends commonLib {
  contracts: Record<string, DeployedContract>;
  deployerAccount: Wallet;
  adminAddress: string;
  adminPrivateKey: string = '';
  rahatAccessManagerAddress: string = '';
  forwarderAddress: string = '';

  constructor() {
    super();
    this.contracts = {};
    this.deployerAccount = this.getDeployerWallet();
    this.adminAddress = process.env.ADMIN_ADDRESS as string;
    this.adminPrivateKey = process.env.RAHAT_ADMIN_PRIVATE_KEY as string;
  }

  public async setupRahatAAContracts() {
    try {
      console.log('PROJECT UUID', this.projectUUID);
      const url = `${process.env.RAHAT_CORE_URL}/v1/settings/CONTRACTS`;
      const { data } = await axios.get(url);
      const contracts = data?.data?.value;
      console.log(
        '[INFO] Loaded contract settings:',
        JSON.stringify(contracts, null, 2)
      );
      this.rahatAccessManagerAddress =
        contracts.RAHATACCESSMANAGER.ADDRESS ||
        contracts.RAHATACCESSMANAGER.address;
      const rahatTreasuryAddress =
        contracts.RAHATTREASURY.ADDRESS || contracts.RAHATTREASURY.address;
      this.forwarderAddress =
        contracts.ERC2771FORWARDER.ADDRESS ||
        contracts.ERC2771FORWARDER.address;

      console.log('--- Deploying TriggerManager ---');
      console.log('[ARGS] TriggerManager:', [2]);
      const TriggerManager = await this.deployContract('TriggerManager', [2]);
      this.contracts['TriggerManager'] = {
        address: TriggerManager.contract.target,
        startBlock: TriggerManager.blockNumber,
      };
      console.log(
        '[DEPLOYED] TriggerManager at',
        TriggerManager.contract.target,
        'Tx:',
        TriggerManager.hash
      );

      console.log('--- Deploying RahatDonor ---');
      console.log('[ARGS] RahatDonor:', [
        this.adminAddress,
        this.rahatAccessManagerAddress,
      ]);
      const RahatDonor = await this.deployContract('RahatDonor', [
        this.adminAddress,
        this.rahatAccessManagerAddress,
      ]);
      this.contracts['RahatDonor'] = {
        address: RahatDonor.contract.target,
        startBlock: RahatDonor.blockNumber,
      };
      console.log(
        '[DEPLOYED] RahatDonor at',
        RahatDonor.contract.target,
        'Tx:',
        RahatDonor.hash
      );

      console.log('--- Deploying RahatToken ---');
      const rahatTokenArgs = [
        this.forwarderAddress,
        rahatTokenDetails.name,
        rahatTokenDetails.symbol,
        RahatDonor.contract.target,
        rahatTokenDetails.decimals,
      ];
      console.log('[ARGS] RahatToken:', rahatTokenArgs);
      const RahatToken = await this.deployContract(
        'RahatToken',
        rahatTokenArgs
      );
      this.contracts['RahatToken'] = {
        address: RahatToken.contract.target,
        startBlock: RahatToken.blockNumber,
      };
      console.log(
        '[DEPLOYED] RahatToken at',
        RahatToken.contract.target,
        'Tx:',
        RahatToken.hash
      );

      console.log('--- Deploying AAProject ---');
      // AAProject constructor expects 4 arguments in this order:
      // 1. _name (string)
      // 2. _defaultToken (address)
      // 3. _forwarder (address)
      // 4. _triggerManager (address)
      // Do NOT include rahatAccessManagerAddress here, as it is not part of the constructor.
      const aaProjectArgs = [
        'AAProject',
        RahatToken.contract.target,
        this.forwarderAddress,
        this.rahatAccessManagerAddress,
        TriggerManager.contract.target,
      ];
      console.log('[ARGS] AAProject:', aaProjectArgs);
      const AAProjectContract = await this.deployContract(
        'AAProject',
        aaProjectArgs
      );
      this.contracts['AAProject'] = {
        address: AAProjectContract.contract.target,
        startBlock: AAProjectContract.blockNumber,
      };
      console.log(
        '[DEPLOYED] AAProject at',
        AAProjectContract.contract.target,
        'Tx:',
        AAProjectContract.hash
      );

      console.log('[INFO] Writing deployed addresses to file');
      await this.writeToDeploymentFile(this.projectUUID, {
        CONTRACTS: this.contracts,
      });
      await this.writeToDeploymentFile(this.projectUUID, {
        RahatToken: {
          contractAddress: RahatToken.contract.target,
          name: rahatTokenDetails.name,
          symbol: rahatTokenDetails.symbol,
          description: rahatTokenDetails.description,
          decimals: rahatTokenDetails.decimals,
          initialSupply: rahatTokenDetails.initialSupply,
          fromBlock: RahatToken.blockNumber,
          transactionHash: RahatToken.hash,
          type: 'CREATED',
        },
      });
    } catch (error) {
      console.error('[ERROR] setupRahatAAContracts:', error);
      throw error;
    }
  }

  public async setupBlockchainNetowrk() {
    console.log('writing chain settings to file');
    const SUBGRAPH_URL = process.env.SUBGRAPH_QUERY_URL;
    const BLOCKCHAIN = {
      rpcUrl: process.env.NETWORK_PROVIDER,
      chainName: process.env.CHAIN_NAME,
      chainId: process.env.NETWORK_ID,
      nativeCurrency: {
        name: process.env.CURRENCY_NAME,
        symbol: process.env.CURRENCY_SYMBOL,
      },
    };
    await this.writeToDeploymentFile(this.projectUUID, {
      BLOCKCHAIN,
      SUBGRAPH_URL: { URL: SUBGRAPH_URL },
    });
    await this.writeToDeploymentFile(this.projectUUID, {
      projectUUID: this.projectUUID,
    });
  }
  public async setupAdminKeys() {
    await this.writeToDeploymentFile(this.projectUUID, {
      ADMIN: { ADDRESS: this.adminAddress },
      RAHAT_ADMIN_PRIVATE_KEY: this.adminPrivateKey,
      DEPLOYER_PRIVATE_KEY: this.deployerAccount.privateKey,
    });
  }

  public async addAdminToAA(addresses: any, deployerKey: string) {
    console.log('Adding Admins to AccessManager:', addresses,deployerKey);
    const adminValues = addresses.map((address: any) => [0, address, 0]);
    const multicallData = await this.generateMultiCallData(
      'RahatAccessManager',
      'grantRole',
      adminValues
    );
    const contracts = await this.getContracts(
      'RahatAccessManager',
      this.rahatAccessManagerAddress, // 0xafcDBda3c600A2017789035708FBA2A329dc5938
      deployerKey
    );
    const res = await contracts.multicall(multicallData);
    await this.sleep(2000);
    console.log(`Added Admins ${addresses} to AccessManager`);
  }

  public async addDonor(addresses: any, deployerKey: string) {
    const adminValues = addresses.map((address: any) => [0, address, 0]);
    const multicallData = await this.generateMultiCallData(
      'RahatAccessManager',
      'grantRole',
      adminValues
    );
    const contracts = await this.getContracts(
      'RahatAccessManager',
      this.rahatAccessManagerAddress,
      deployerKey
    );
    const res = await contracts.multicall(multicallData);
    await this.sleep(2000);
    console.log(`Added Donor ${addresses} to  Project`);
  }
}

async function main() {
  const deploymentSetup = new DeploymentSetup();
  await deploymentSetup.setupRahatAAContracts();
  await deploymentSetup.setupBlockchainNetowrk();
  await deploymentSetup.setupAdminKeys();

  //Make Contract call to make admins
  //addAdminToAA
  //addDonorAsAdmin
  console.log('Deployer Address:', deploymentSetup.deployerAccount.address);
  await deploymentSetup.addAdminToAA(
    [deploymentSetup.adminAddress],
    deploymentSetup.deployerAccount.privateKey
  );
  await deploymentSetup.addDonor(
    [deploymentSetup.adminAddress],
    deploymentSetup.deployerAccount.privateKey
  );
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});

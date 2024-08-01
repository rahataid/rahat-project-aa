import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import { randomBytes } from 'crypto';
import * as dotenv from 'dotenv';
import { uuidV4, Addressable } from 'ethers';
import { writeFileSync } from 'fs';
import { ContractLib } from './_common';
import { Prisma, PrismaClient } from '@prisma/client';
dotenv.config();


const corePrisma = new PrismaClient({
  datasourceUrl: process.env.CORE_DATABASE_URL as string
});
const prisma = new PrismaService();
const settings = new SettingsService(prisma);


const contractName = [
  'ERC2771Forwarder',
  'AAProject',
  'RahatAccessManager',
  'RahatDonor',
  'RahatToken'
];

interface DeployedContract {
  address: string | Addressable;
  startBlock: number;
}

class ContractSeed extends ContractLib {
  projectUUID: string;
  contracts: Record<string, DeployedContract>;


  constructor() {
    super();
    this.projectUUID = process.env.PROJECT_ID as string;
    this.contracts = {};
  }

  static getUUID() {
    return uuidV4(randomBytes(16));
  }

  public sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async deployAAContracts() {

    const deployerKey = (await prisma.setting.findUnique({
      where: {
        name: 'DEPLOYER_PRIVATE_KEY'
      }
    }))?.value as string

    console.log("------DEPLOYER KEY-----");
    console.log(deployerKey);

    const deployerAccount = this.getWalletFromPrivateKey(deployerKey);

    console.log(deployerAccount)
    console.log("----------Deploying Access Manager-----------------")
    const AccessContract = await this.deployContract('RahatAccessManager', [deployerAccount], deployerKey);
    this.contracts['RahatAccessManager'] = {
      address: AccessContract.contract.target,
      startBlock: AccessContract.blockNumber
    };

    console.log("----------Depolying Trigger Contract -------------------")
    const TriggerManager = await this.deployContract('TriggerManager', [2], deployerKey);
    this.contracts['TriggerManager'] = {
      address: TriggerManager.contract.target,
      startBlock: TriggerManager.blockNumber
    };

    console.log("----------Depolying Rahat Donor-------------------")
    const DonorContract = await this.deployContract('RahatDonor', [deployerAccount, await AccessContract.contract.getAddress()], deployerKey);
    this.contracts['RahatDonor'] = {
      address: DonorContract.contract.target,
      startBlock: DonorContract.blockNumber
    };

    console.log("----------Depolying Forwarder Contracts-------------------")
    const ForwarderContract = await this.deployContract('ERC2771Forwarder', ["Rumsan Forwarder"], deployerKey);
    this.contracts['ERC2771Forwarder'] = {
      address: ForwarderContract.contract.target,
      startBlock: ForwarderContract.blockNumber
    };

    console.log("----------Depolying Rahat Token-------------------")
    const RahatToken = await this.deployContract('RahatToken', [await ForwarderContract.contract.getAddress(), "RahatToken", "RHT", await DonorContract.contract.getAddress(), 1], deployerKey);
    this.contracts['RahatToken'] = {
      address: RahatToken.contract.target,
      startBlock: RahatToken.blockNumber
    };
    console.log("----------Depolying AA Project Contract-------------------")
    const AAProjectContract = await this.deployContract('AAProject', ["AAProject", await RahatToken.contract.getAddress(), await ForwarderContract.contract.getAddress(), await AccessContract.contract.getAddress(), await TriggerManager.contract.getAddress()], deployerKey);
    this.contracts['AAProject'] = {
      address: AAProjectContract.contract.target,
      startBlock: AAProjectContract.blockNumber
    };

    console.log("Writing deployed address to file")
    this.writeToDeploymentFile(this.projectUUID, this.contracts);

    this.sleep(20000)

    console.log("Adding donor contract as admin in AA Project")
    console.log([DonorContract.contract.target, true])
    await this.callContractMethod('RahatAccessManager', 'grantRole', [0, DonorContract.contract.target, 0], 'RahatAccessManager', this.projectUUID, deployerAccount);

    console.log("Registering Project in Donor")
    await this.callContractMethod('RahatDonor', 'registerProject', [AAProjectContract.contract.target, true], 'RahatDonor', this.projectUUID, deployerAccount);

  }

  public async addContractSettings() {
    console.log("Adding contract settings")
    const contracts = await this.getDeployedContractDetails(this.projectUUID, contractName);
    const data = {
      name: 'CONTRACT',
      value: contracts,
      isPrivate: false
    };

    await settings.create(data);
  }
}
export default ContractSeed;
async function main() {
  const contractSeed = new ContractSeed();
  await contractSeed.deployAAContracts();
  await contractSeed.addContractSettings();

  process.exit(0);
}
main();

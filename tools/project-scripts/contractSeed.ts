import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import { randomBytes } from 'crypto';
import * as dotenv from 'dotenv';
import { uuidV4 } from 'ethers';
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
  'AccessManager',
  'RahatDonor',
  'RahatToken'
];

class ContractSeed extends ContractLib {
  projectUUID: string;

  constructor() {
    super();
    this.projectUUID = process.env.PROJECT_ID as string
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
    const AccessContract = await this.deployContract('AccessManager', [[deployerAccount]], deployerKey);
    console.log({ AccessContract: AccessContract.contract.target, blockNumber: AccessContract.blockNumber })

    console.log("----------Depolying Trigger Contract -------------------")
    const TriggerManager = await this.deployContract('TriggerManager', [2], deployerKey);
    console.log({ TriggerManager: TriggerManager.contract.target, blockNumber: TriggerManager.blockNumber })


    console.log("----------Depolying Rahat Donor-------------------")
    const DonorContract = await this.deployContract('RahatDonor', [deployerAccount, await AccessContract.contract.getAddress()], deployerKey);
    console.log({ DonorContract: DonorContract.contract.target, blockNumber: DonorContract.blockNumber })

    console.log("----------Depolying Forwarder Contracts-------------------")
    const ForwarderContract = await this.deployContract('ERC2771Forwarder', ["Rumsan Forwarder"], deployerKey);
    console.log({ ForwarderContract: ForwarderContract.contract.target, blockNumber: DonorContract.blockNumber });

    console.log("----------Depolying Rahat Token-------------------")
    const RahatToken = await this.deployContract('RahatToken', [await ForwarderContract.contract.getAddress(), "RahatToken", "RHT", await DonorContract.contract.getAddress(), 1], deployerKey);
    console.log({ RahatToken: RahatToken.contract.target, blockNumber: DonorContract.blockNumber });


    console.log("----------Depolying AA Project Contract-------------------")
    const AAProjectContract = await this.deployContract('AAProject', ["AAProject", await RahatToken.contract.getAddress(), await ForwarderContract.contract.getAddress(), await AccessContract.contract.getAddress(), await TriggerManager.contract.getAddress()], deployerKey);
    console.log({ AAProjectContract: AAProjectContract.contract.target, blockNumber: DonorContract.blockNumber });

    console.log("Writing deployed address to file")
    writeFileSync(`${__dirname}/${this.projectUUID}.json`, JSON.stringify({
      AccessManager: {
        address: AccessContract.contract.target,
        startBlock: AccessContract.blockNumber
      },
      TriggerManager: {
        address: TriggerManager.contract.target,
        startBlock: TriggerManager.blockNumber
      },
      RahatDonor: {
        address: DonorContract.contract.target,
        startBlock: DonorContract.blockNumber
      },
      ERC2771Forwarder: {
        address: ForwarderContract.contract.target,
        startBlock: ForwarderContract.blockNumber
      },
      RahatToken: {
        address: RahatToken.contract.target,
        startBlock: RahatToken.blockNumber
      },
      AAProject: {
        address: AAProjectContract.contract.target,
        startBlock: AAProjectContract.blockNumber
      }
    }, null, 2)
    )

    this.sleep(20000)

    console.log("Adding donor contract as admin in AA Project")
    console.log([DonorContract.contract.target, true])
    await this.callContractMethod('AccessManager', 'updateAdmin', [DonorContract.contract.target, true], 'AccessManager', this.projectUUID, deployerAccount);

    console.log("Registering Project in Donor")
    await this.callContractMethod('RahatDonor', 'registerProject', [AAProjectContract.contract.target, true], 'RahatDonor', this.projectUUID, deployerAccount);

  }

  public async addContractSettings() {
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

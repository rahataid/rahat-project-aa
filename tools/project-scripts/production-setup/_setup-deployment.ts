import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import { randomBytes } from 'crypto';
import * as dotenv from 'dotenv';
import { uuidV4, Addressable } from 'ethers';
import { writeFileSync } from 'fs';
import { ContractLib } from './_common';
import { Prisma, PrismaClient } from '@prisma/client';
import { DeployedContract } from '../types/blockchain';
import axios from 'axios';
dotenv.config();

const corePrisma = new PrismaClient({
  datasourceUrl: process.env.CORE_DATABASE_URL as string,
});
const prisma = new PrismaService();
const settings = new SettingsService(prisma);

const contractName = ['AAProject', 'RahatDonor', 'RahatToken'];

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

  public async getDevSettings() {
    const [devSettings] = await corePrisma.$queryRaw<any[]>(
      Prisma.sql([`SELECT *  FROM tbl_settings WHERE name='CONTRACTS'`])
    );
    return devSettings;
  }

  public async deployAAContracts() {
    // const contractDetails = await this.getDevSettings();
    // console.log('contractDetails', contractDetails);


     const url = `${process.env.RAHAT_CORE_URL}/v1/settings/CONTRACTS`;
     const { data } = await axios.get(url);
     const contractDetails = data?.data
    const RahatAccessManagerAddress =
      contractDetails.value.RAHATACCESSMANAGER.address;
    const forwarderAddress = contractDetails.value.ERC2771FORWARDER.address;
    const treasuryAddress = contractDetails.value.RAHATTREASURY.address;

    const deployerKey = (
      await prisma.setting.findUnique({
        where: {
          name: 'DEPLOYER_PRIVATE_KEY',
        },
      })
    )?.value as string;

    // const deployerKey = process.env.DEPLOYER_PRIVATE_KEY as string;

    console.log('------DEPLOYER KEY-----');
    console.log(deployerKey);

    const deployerAccount = this.getWalletFromPrivateKey(deployerKey);

    console.log(deployerAccount);

    console.log('----------Depolying Trigger Contract -------------------');
    const TriggerManager = await this.deployContract(
      'TriggerManager',
      [2],
      deployerKey
    );
    this.contracts['TriggerManager'] = {
      address: TriggerManager.contract.target,
      startBlock: TriggerManager.blockNumber,
    };

    console.log('----------Depolying Rahat Donor-------------------');
    const DonorContract = await this.deployContract(
      'RahatDonor',
      [deployerAccount, RahatAccessManagerAddress],
      deployerKey
    );
    this.contracts['RahatDonor'] = {
      address: DonorContract.contract.target,
      startBlock: DonorContract.blockNumber,
    };

    console.log('----------Depolying Rahat Token-------------------');
    const RahatToken = await this.deployContract(
      'RahatToken',
      [
        forwarderAddress,
        'RahatToken',
        'RHT',
        await DonorContract.contract.getAddress(),
        1,
      ],
      deployerKey
    );
    this.contracts['RahatToken'] = {
      address: RahatToken.contract.target,
      startBlock: RahatToken.blockNumber,
    };
    console.log('----------Depolying AA Project Contract-------------------');
    const AAProjectContract = await this.deployContract(
      'AAProject',
      [
        'AAProject',
        await RahatToken.contract.getAddress(),
        forwarderAddress,
        RahatAccessManagerAddress,
        await TriggerManager.contract.getAddress(),
      ],
      deployerKey
    );
    this.contracts['AAProject'] = {
      address: AAProjectContract.contract.target,
      startBlock: AAProjectContract.blockNumber,
    };

    console.log("----------Deploying CashToken Contract-------------------'");
    const CashToken = await this.deployContract(
      'CashToken',
      ['CashToken', 'CASH', 1, 100000, DonorContract.contract.target],
      deployerKey
    );
    this.contracts['CashToken'] = {
      address: CashToken.contract.target,
      startBlock: CashToken.blockNumber,
    };

    console.log('Writing deployed address to file');
    this.writeToDeploymentFile(this.projectUUID, this.contracts);

    this.sleep(20000);

    console.log('Adding donor contract as admin in AA Project');
    console.log([DonorContract.contract.target, true]);
    await this.callContractMethod(
      'RahatAccessManager',
      'grantRole',
      [0, DonorContract.contract.target, 0],
      RahatAccessManagerAddress,
      deployerAccount
    );

    console.log('Registering Project in Donor');
    const donorContractAddress = this.getDeployedAddress(
      this.projectUUID,
      'RahatDonor'
    );
    await this.callContractMethod(
      'RahatDonor',
      'registerProject',
      [AAProjectContract.contract.target, true],
      donorContractAddress,
      deployerAccount
    );

    console.log('Adding deployer address as admin in AA Project ');
    await this.callContractMethod(
      'RahatAccessManager',
      'grantRole',
      [0, deployerAccount, 0],
      RahatAccessManagerAddress,
      deployerAccount
    );
  }

  public async addContractSettings() {
    console.log('Adding contract settings');
    const contracts = await this.getDeployedContractDetails(
      this.projectUUID,
      contractName
    );
    const data = {
      name: 'CONTRACT',
      value: contracts,
      isPrivate: false,
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

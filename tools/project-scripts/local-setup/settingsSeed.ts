import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import * as dotenv from 'dotenv';
import { ContractLib } from './_common';
dotenv.config();

const prismaClient = new PrismaClient({
  datasourceUrl: process.env.CORE_DATABASE_URL as string,
});

const prisma = new PrismaService();
const settings = new SettingsService(prisma);
const subGraphURL = process.argv[2];

class SettingsSeed extends ContractLib {
  projectUUID: string;

  constructor() {
    super();
    this.projectUUID = process.env.PROJECT_ID as string;
  }

  async getAADevSettings() {
    const [devSettings] = await prismaClient.$queryRaw<any[]>(
      Prisma.sql([`SELECT *  FROM tbl_settings WHERE name='AA_DEV'`])
    );
    return devSettings;
  }

  public async getDevContracts() {
    const [devSettings] = await prismaClient.$queryRaw<any[]>(
      Prisma.sql([`SELECT *  FROM tbl_settings WHERE name='CONTRACTS'`])
    );
    return devSettings;
  }

  async updateProjectStatus(status = 'ACTIVE') {
    await prismaClient.$queryRaw<any[]>(
      Prisma.sql([
        `UPDATE tbl_projects SET status='${status}' WHERE uuid='${this.projectUUID}'`,
      ])
    );
    console.log(`Project status updated to ${status}`);
  }

  public async addAppSettings() {
    await settings.create({
      name: 'Blockchain',
      value: {
        chainId: '8888',
        name: 'localhost',
        type: 'evm',
        rpcUrl: 'http://127.0.0.1:8888',
        explorerUrl: 'https://etherscan.io',
        currency: {
          name: 'LOCALHOST_ETH',
          symbol: 'ETH',
        },
      },
      isPrivate: false,
    });
  }

  public async addAdminAddress(adminAcc: string) {
    await settings.create({
      name: 'Admin',
      value: {
        address: adminAcc,
      },
      isPrivate: false,
    });
  }

  public async addGraphSettings() {
    const formatted = subGraphURL?.substring(
      0,
      subGraphURL.indexOf('\\') !== -1 ? subGraphURL.indexOf('\\') : undefined
    );
    const formattedURL = formatted
      ? formatted
      : 'http://localhost:8000/subgraphs/name/rahat/el';
    await settings.create({
      name: 'SUBGRAPH_URL',
      value: {
        url: formattedURL,
      },
      isPrivate: false,
    });
  }

  public async addAdminToAA(addresses: any, deployerKey: string) {
    const contractDetails = await this.getDevContracts();
    console.log('contractDetails', contractDetails);
    const rahatAccessManagerAddress =
      contractDetails.value.RAHATACCESSMANAGER.ADDRESS;
    const adminValues = addresses.map((address: any) => [0, address, 0]);
    const multicallData = await this.generateMultiCallData(
      'RahatAccessManager',
      'grantRole',
      adminValues
    );
    const contracts = await this.getContracts(
      'RahatAccessManager',
      rahatAccessManagerAddress,
      deployerKey
    );
    const res = await contracts.multicall(multicallData);
    await this.delay(2000);
    console.log(`Added Admins ${addresses} to AccessManager`);
  }

  public async addDonor(addresses: any, deployerKey: string) {
    const contractDetails = await this.getDevContracts();
    console.log('contractDetails', contractDetails);
    const rahatAccessManagerAddress =
      contractDetails.value.RAHATACCESSMANAGER.ADDRESS;
    const adminValues = addresses.map((address: any) => [0, address, 0]);
    const multicallData = await this.generateMultiCallData(
      'RahatAccessManager',
      'grantRole',
      adminValues
    );
    const contracts = await this.getContracts(
      'RahatAccessManager',
      rahatAccessManagerAddress,
      deployerKey
    );
    const res = await contracts.multicall(multicallData);
    await this.delay(2000);
    console.log(`Added Donor ${addresses} to  Project`);
  }
}
async function main() {
  const seedProject = new SettingsSeed();
  const devSettings = await seedProject.getAADevSettings();
  console.log('devSettings', devSettings);
  const adminAccounts = devSettings.value!.adminAccounts;

  const deployerKey = (
    await prisma.setting.findUnique({
      where: {
        name: 'DEPLOYER_PRIVATE_KEY',
      },
    })
  )?.value as string;

  console.log('adding app settings');
  await seedProject.addAppSettings();
  await seedProject.addAdminAddress(adminAccounts[0]);
  await seedProject.addGraphSettings();

  await seedProject.addAdminToAA(adminAccounts, deployerKey);
  await seedProject.addDonor(adminAccounts, deployerKey);
  await seedProject.updateProjectStatus();
  console.log('=====Local Settings Seeded Successfully=====');

  process.exit(0);
}
main();

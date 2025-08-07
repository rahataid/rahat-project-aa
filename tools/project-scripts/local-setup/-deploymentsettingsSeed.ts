import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import axios from 'axios';
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

  public async addAppSettings() {
    await settings.create({
      name: 'Blockchain',
      value: {
        chainId: process.env.CHAIN_ID,
        name: process.env.CHAIN_NAME,
        type: process.env.CHAIN_TYPE || 'evm', // Default to EVM if not specified
        rpcUrl: process.env.NETWORK_PROVIDER,
        explorerUrl: process.env.BLOCK_EXPLORER_URL || 'https://etherscan.io',
        currency: {
          name: process.env.CURRENCY_NAME,
          symbol: process.env.CURRENCY_SYMBOL,
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
    // const formatted = subGraphURL.substring(0, subGraphURL.indexOf('\\') !== -1 ? subGraphURL.indexOf('\\') : undefined);
    // const formattedURL = formatted ? formatted : 'http://localhost:8000/subgraphs/name/rahat/el'
    const formattedURL = process.env.SUBGRAPH_URL;
    await settings.create({
      name: 'SUBGRAPH_URL',
      value: {
        url: formattedURL,
      },
      isPrivate: false,
    });
  }

  public async addAdminToEl(addresses: any) {
    const deployerAccount = this.getWalletFromPrivateKey(this.deployerAddress);
    const contractAddress = this.getDeployedAddress(
      this.projectUUID,
      'RahatAccessManager'
    );
    await this.callContractMethod(
      'AccessManager',
      'updateAdmin',
      [addresses, true],
      contractAddress,
      deployerAccount
    );
    await this.delay(2000);
    console.log(`Added Admins ${addresses} to AccessManager`);
  }

  public async addDonor(addresses: any) {
    const deployerAccount = this.getWalletFromPrivateKey(this.deployerAddress);
    const contractAddress = this.getDeployedAddress(
      this.projectUUID,
      'RahatAccessManager'
    );
    await this.callContractMethod(
      'AccessManager',
      'updateDonor',
      [addresses, true],
      contractAddress,
      deployerAccount
    );
    await this.delay(2000);
    console.log(`Added Donor ${addresses} to  Project`);
  }

  public async updateProjectStatus() {
    const projectId = process.env.PROJECT_ID;
    const url = `${process.env.RAHAT_CORE_URL}/v1/projects/${projectId}/status`;
    await axios.patch(url, { status: 'ACTIVE' });
  }
}
async function main() {
  const seedProject = new SettingsSeed();

  const adminAccounts = [
    '0xf0c84735Af5669c809EfD62C9D4e466d331A95b0',
    '0xAC6bFaf10e89202c293dD795eCe180BBf1430d7B',
    '0xcDEe632FB1Ba1B3156b36cc0bDabBfd821305e06',
    '0x033CC5Ea971bed3e08a773b3424A00b407193518',
  ];

  await seedProject.addAppSettings();
  await seedProject.addAdminAddress(adminAccounts[0]);
  await seedProject.addGraphSettings();
  await seedProject.updateProjectStatus();

  process.exit(0);
}
main();

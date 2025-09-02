import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import { randomBytes } from 'crypto';
import * as dotenv from 'dotenv';
import { uuidV4, Addressable } from 'ethers';
import { writeFileSync } from 'fs';
import { ContractLib } from './_common';
import { Prisma, PrismaClient } from '@prisma/client';
import { DeployedContract } from '../types/blockchain';
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
    const contractDetails = await this.getDevSettings();
    console.log('contractDetails', contractDetails);

    const RahatAccessManagerAddress =
      contractDetails.value.RAHATACCESSMANAGER.address ||
      contractDetails.value.RAHATACCESSMANAGER.ADDRESS;
    const forwarderAddress =
      contractDetails.value.ERC2771FORWARDER.address ||
      contractDetails.value.ERC2771FORWARDER.ADDRESS;
    const treasuryAddress =
      contractDetails.value.RAHATTREASURY.address ||
      contractDetails.value.RAHATTREASURY.ADDRESS;

    const deployerKey = (
      await prisma.setting.findUnique({
        where: {
          name: 'DEPLOYER_PRIVATE_KEY',
        },
      })
    )?.value as string;

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
    console.log(deployerAccount, RahatAccessManagerAddress, deployerKey);
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
        // await DonorContract.contract.getAddress(),
        deployerAccount,
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


    console.log("Adding deployer address as admin in AA Project ");
    await this.callContractMethod(
       'RahatAccessManager',
      'grantRole',
      [0, deployerAccount, 0],
      RahatAccessManagerAddress,
      deployerAccount
    )

    // !!!! todo: Remove after test
    console.log('Adding donor as token owner, remove after test');

    // First, add the donor as an owner directly to the RahatToken contract
    await this.callContractMethod(
      'RahatToken',
      'addOwner',
      [donorContractAddress],
      await RahatToken.contract.getAddress(),
      deployerAccount
    );

    // Then, also add through the donor contract for consistency
    await this.callContractMethod(
      'RahatDonor',
      'addTokenOwner',
      [await RahatToken.contract.getAddress(), donorContractAddress],
      donorContractAddress,
      deployerAccount
    );

    console.log('Minting initial tokens to project');
    // Mint 1,000,000 tokens (with 1 decimal, this is 1,000,000 * 10^1 = 10,000,000)
    const initialTokenAmount = BigInt(100000000) * BigInt(10); // 1 million tokens with 1 decimal
    await this.callContractMethod(
      'RahatDonor',
      'mintTokens',
      [
        await RahatToken.contract.getAddress(),
        AAProjectContract.contract.target,
        initialTokenAmount,
      ],
      donorContractAddress,
      deployerAccount
    );

    console.log(`Minted ${initialTokenAmount} tokens to project`);

    // Test assignTokenToBeneficiary functionality
    console.log('Testing assignTokenToBeneficiary functionality...');

    // Generate a random beneficiary address for testing
    const randomWallet = this.getWalletFromPrivateKey(
      '0x' + randomBytes(32).toString('hex')
    );
    const testBeneficiaryAddress = randomWallet.address.toString();
    const testTokenAmount = BigInt(1000) * BigInt(10); // 1000 tokens with 1 decimal

    console.log(`Test beneficiary address: ${testBeneficiaryAddress}`);
    console.log(`Test token amount: ${testTokenAmount.toString()}`);

    // Call assignTokenToBeneficiary method on AAProject contract
    console.log('Calling assignTokenToBeneficiary...');
    await this.callContractMethod(
      'AAProject',
      'assignTokenToBeneficiary',
      [testBeneficiaryAddress, testTokenAmount],
      AAProjectContract.contract.target.toString(),
      deployerAccount
    );

    console.log('Token assignment completed. Verifying assignment...');

    // Wait a bit for the transaction to be processed
    await this.sleep(5000);

    // Verify the assignment by checking benTokens mapping
    console.log('Checking benTokens mapping...');
    const benTokensBalance = await this.callContractMethod(
      'AAProject',
      'benTokens',
      [testBeneficiaryAddress],
      AAProjectContract.contract.target.toString(),
      deployerAccount
    );

    console.log(
      `Beneficiary ${testBeneficiaryAddress} has ${benTokensBalance.toString()} tokens in benTokens mapping`
    );

    // Verify both balances match
    if (benTokensBalance.toString() === testTokenAmount.toString()) {
      console.log('✅ SUCCESS: benTokens mapping shows correct amount');
    } else {
      console.log('❌ ERROR: benTokens mapping amount mismatch');
      console.log(
        `Expected: ${testTokenAmount.toString()}, Got: ${benTokensBalance.toString()}`
      );
    }

    console.log('Token assignment test completed!');
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

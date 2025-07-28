// scripts/mint-rahat-tokens.ts
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
const RahatDonorAbi = require('./RahatDonorAbi.json');

// Load environment variables
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient();

async function mintRahatTokens() {
  try {
    // Get contract address from settings
    const settings = await prisma.setting.findUnique({
      where: { name: 'CHAIN_SETTINGS' },
    });

    if (!settings?.value) {
      throw new Error('CHAIN_SETTINGS not found in database');
    }

    const { rpcUrl } = settings.value as {
      rpcUrl: string;
    };

    const tokenContractAddress = '0xcA972Dc289297bA0244470D78c38598d58d19C21';

    console.log(tokenContractAddress, rpcUrl, 'token contract, rpc url');

    // Get deployer private key from environment
    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!deployerPrivateKey) {
      throw new Error(
        'DEPLOYER_PRIVATE_KEY not found in environment variables'
      );
    }

    // Initialize provider and signer
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(deployerPrivateKey, provider);

    // Connect to the token contract
    const tokenContract = new ethers.Contract(
      tokenContractAddress,
      RahatDonorAbi,
      wallet
    );

    console.log(`Connected to token contract`);

    // Example: Mint 1000 tokens to the deployer's address
    const recipient = '0xCF6a6649a1f1bF7911B8bF726b523012B52a28b4';
    const amount = ethers.parseUnits('1000', 18); // 1000 tokens

    // Execute the mint transaction
    const tx = await tokenContract.mintTokens(
      '0x1876A19A0Ab56510C2E3c0317C95b47B8BC100C0',
      recipient,
      amount
    );
    console.log(`Transaction hash: ${tx.hash}`);

    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

    return {
      success: true,
      transactionHash: tx.hash,
      recipient,
      amount: amount.toString(),
    };
  } catch (error) {
    console.error('Error minting tokens:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Execute the script
if (require.main === module) {
  mintRahatTokens()
    .then((result) => {
      console.log('✅ Token minting successful:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Token minting failed:', error);
      process.exit(1);
    });
}

export { mintRahatTokens };

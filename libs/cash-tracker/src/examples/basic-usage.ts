import * as dotenv from 'dotenv';
import { CashTokenSDK } from '../core/CashTokenSDK';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Load config from config/entities.json
const loadConfig = () => {
  const configPath = path.join(__dirname, '../config/entities.json');
  const configData = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(configData);
};

export async function basicUsage(): Promise<void> {
  console.log('🚀 Starting Cash Tracker SDK Basic Usage Example\n');

  try {
    // Load configuration from config/entities.json
    const config = loadConfig();
    const entities = config.entities;

    if (entities.length < 2) {
      throw new Error('Need at least 2 entities in config for this example');
    }

    // 1. Initialize SDK with full configuration for Entity 1
    const entity1 = new CashTokenSDK({
      network: {
        rpcUrl: config.network,
        entryPoint: config.entryPoint,
      },
      contracts: {
        cashToken: process.env.CASH_TOKEN!,
        cashtokenAbi: require('../src/artifacts/CashTokenAbi.json'),
        entitySmartAccount: entities[0].smartAccount,
        defaultPrivatekey: entities[0].privateKey,
      },
    });

    // 2. Initialize SDK with full configuration for Entity 2
    const entity2 = new CashTokenSDK({
      network: {
        rpcUrl: config.network,
        entryPoint: config.entryPoint,
      },
      contracts: {
        cashToken: process.env.CASH_TOKEN!,
        cashtokenAbi: require('../src/artifacts/CashTokenAbi.json'),
        entitySmartAccount: entities[1].smartAccount,
        defaultPrivatekey: entities[1].privateKey,
      },
    });

    const entity3 = new CashTokenSDK({
      network: {
        rpcUrl: config.network,
        entryPoint: config.entryPoint,
      },
      contracts: {
        cashToken: process.env.CASH_TOKEN!,
        cashtokenAbi: require('../src/artifacts/CashTokenAbi.json'),
        entitySmartAccount: entities[2].smartAccount,
        defaultPrivatekey: entities[2].privateKey,
      },
    });

    // 3. Initialize both entities
    console.log('📋 Step 3: Initializing both entities...');
    await entity1.initialize();
    await entity2.initialize();
    await entity3.initialize();

    // // Connect wallets to set entity addresses
    // entity1.connect(entities[0].privateKey);
    // entity2.connect(entities[1].privateKey);
    // entity3.connect(entities[2].privateKey);

    console.log('✅ Both entities initialized successfully');
    console.log(`Entity 1 address: ${entity1.address}`);
    console.log(`Entity 2 address: ${entity2.address}`);
    console.log(`Entity 3 address: ${entity3.address}`);

    // 4. Check initial balances
    console.log('\n📋 Step 4: Checking initial balances...');
    const entity1Balance = await entity1.getCashBalance();
    const entity2Balance = await entity2.getCashBalance();
    const entity3Balance = await entity3.getCashBalance();
    console.log(
      `Entity 1 balance: ${entity1Balance.formatted} ${entity1Balance.symbol}`
    );
    console.log(
      `Entity 2 balance: ${entity2Balance.formatted} ${entity2Balance.symbol}`
    );
    console.log(
      `Entity 3 balance: ${entity3Balance.formatted} ${entity3Balance.symbol}`
    );
    // 5. Give cash allowance from Entity 2 to Entity 1 (correct direction for transferFrom)
    console.log('\n🔐 Giving cash allowance from Entity 2 to Entity 1...');
    // Use string amount - SDK will handle parsing internally
    const allowanceAmount = '0.5'; // 0.5 tokens (smaller amount)

    try {
      const allowanceResult = await entity2.giveCashAllowance(
        entity1.smartAccount!,
        allowanceAmount
      );
      console.log(
        `✅ Allowance transaction confirmed: ${allowanceResult.hash}`
      );
    } catch (error) {
      console.log('⚠️  Allowance transaction failed:', error);
    }

    // 6. Check allowance status
    console.log('\n🔍 Checking allowance status...');
    try {
      const allowanceToEntity2 = await entity1.getCashApprovedByMe(
        entity2.smartAccount!
      );
      console.log(
        `Entity 1 approved to Entity 2: ${allowanceToEntity2.formatted} tokens`
      );

      const allowanceToEntity1 = await entity2.getCashApprovedByMe(
        entity1.smartAccount!
      );
      console.log(
        `Entity 2 approved to Entity 1: ${allowanceToEntity1.formatted} tokens`
      );
      const allowanceToEntity3 = await entity1.getCashApprovedByMe(
        entity3.smartAccount!
      );
      console.log(
        `Entity 1 approved to Entity 3: ${allowanceToEntity3.formatted} tokens`
      );
    } catch (error) {
      console.log('⚠️  Could not check allowances:', error);
    }

    // 7. Transfer cash from Entity 2 to Entity 1 (using allowance)
    console.log('\n💸 Transferring cash from Entity 2 to Entity 1...');
    // Use string amount - SDK will handle parsing internally
    const transferAmount = '0.5'; // 0.5 tokens (smaller amount)

    try {
      const transferResult = await entity1.getCashFrom(
        entity2.smartAccount!,
        transferAmount
      );
      console.log(`✅ Transfer transaction confirmed: ${transferResult.hash}`);
    } catch (error) {
      console.log('⚠️  Transfer transaction failed:', error);
    }

    // 8. Check final balances
    console.log('\n💰 Checking final balances...');
    const finalEntity1Balance = await entity1.getCashBalance();
    const finalEntity2Balance = await entity2.getCashBalance();

    console.log(
      `Entity 1 final balance: ${finalEntity1Balance.formatted} ${finalEntity1Balance.symbol}`
    );
    console.log(
      `Entity 2 final balance: ${finalEntity2Balance.formatted} ${finalEntity2Balance.symbol}`
    );

    // 9. Test network connection
    console.log('\n🌐 Testing network connection...');
    const provider = entity1.getProvider();
    if (provider) {
      try {
        const blockNumber = await provider.getBlockNumber();
        console.log(`✅ Connected to network. Current block: ${blockNumber}`);
      } catch (error) {
        console.log('⚠️  Network connection failed:', error);
      }
    }

    // 10. Test CashToken contract
    console.log('\n💰 Testing CashToken contract...');
    const cashTokenContract = entity1.getCashTokenContract();
    if (cashTokenContract) {
      try {
        const name = await cashTokenContract.name();
        const symbol = await cashTokenContract.symbol();
        console.log(
          `✅ CashToken contract accessible. Name: ${name}, Symbol: ${symbol}`
        );
      } catch (error) {
        console.log('⚠️  CashToken contract access failed:', error);
      }
    }

    console.log('\n✅ Basic usage example completed successfully!');
    console.log('\n📝 Summary of operations:');
    console.log('  1. Initialized two entities with their own smart accounts');
    console.log('  2. Connected wallets to the entities');
    console.log('  3. Checked initial balances');
    console.log('  4. Entity 1 gave allowance to Entity 2');
    console.log('  5. Entity 1 transferred cash from Entity 2 using allowance');
    console.log('  6. Verified final balances and network connectivity');
  } catch (error) {
    console.error('❌ Error in basic usage example:', error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    await basicUsage();
  } catch (error) {
    console.error('❌ Example failed:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main();
}

import * as dotenv from 'dotenv';
import { CashTokenSDK } from '../core/CashTokenSDK';
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

export async function aliasUsageDemo(): Promise<void> {
  console.log('🚀 Entity Alias Usage Examples\n');

  try {
    const config = loadConfig();
    const entities = config.entities;

    if (entities.length < 3) {
      throw new Error('Need at least 3 entities for demo');
    }

    // Initialize SDK
    const flowTracker = new CashTokenSDK({
      network: {
        rpcUrl: config.network,
        entryPoint: config.entryPoint,
      },
      contracts: {
        cashToken: process.env.CASH_TOKEN!,
        cashtokenAbi: require('../src/artifacts/CashTokenAbi.json'),
      },
    });

    await flowTracker.initialize();
    console.log('✅ SDK initialized\n');

    console.log('📋 DIFFERENT WAYS TO USE ALIASES:');
    console.log('='.repeat(60));

    // Method 1: Using aliases from config
    console.log('\n1️⃣ Using aliases from config file');
    console.log('-'.repeat(40));
    const flowsWithConfigAliases = await flowTracker.getAllFlowsAsJSON();
    console.log(
      `Found ${flowsWithConfigAliases.length} flows with config aliases`
    );
    flowsWithConfigAliases.forEach((flow, index) => {
      console.log(
        `   ${index + 1}. ${flow.pathAliases.join(' → ')} (${flow.totalAmount})`
      );
    });

    // Method 2: Passing custom aliases
    console.log('\n2️⃣ Using custom aliases');
    console.log('-'.repeat(40));
    const customAliases = [
      { smartAddress: entities[0].smartAccount, alias: 'Sender' },
      { smartAddress: entities[1].smartAccount, alias: 'Middleman' },
      { smartAddress: entities[2].smartAccount, alias: 'Receiver' },
    ];
    const flowsWithCustomAliases = await flowTracker.getAllFlowsAsJSON(
      customAliases
    );
    console.log(
      `Found ${flowsWithCustomAliases.length} flows with custom aliases`
    );
    flowsWithCustomAliases.forEach((flow, index) => {
      console.log(
        `   ${index + 1}. ${flow.pathAliases.join(' → ')} (${flow.totalAmount})`
      );
    });

    // Method 3: Using just addresses (no aliases)
    console.log('\n3️⃣ Using just addresses (no aliases)');
    console.log('-'.repeat(40));
    const addressesOnly = entities
      .slice(0, 3)
      .map((entity: any) => entity.smartAccount);
    const flowsWithAddressesOnly = await flowTracker.getAllFlowsAsJSON(
      addressesOnly
    );
    console.log(
      `Found ${flowsWithAddressesOnly.length} flows with addresses only`
    );
    flowsWithAddressesOnly.forEach((flow, index) => {
      console.log(
        `   ${index + 1}. ${flow.path.join(' → ').slice(0, 50)}... (${
          flow.totalAmount
        })`
      );
    });

    // Method 4: Mixed approach - some with aliases, some without
    console.log('\n4️⃣ Mixed approach - some with aliases, some without');
    console.log('-'.repeat(40));
    const mixedAliases = [
      { smartAddress: entities[0].smartAccount, alias: 'Alice' },
      { smartAddress: entities[1].smartAccount, alias: '' }, // Empty alias
      { smartAddress: entities[2].smartAccount, alias: 'Charlie' },
    ];
    const flowsWithMixedAliases = await flowTracker.getAllFlowsAsJSON(
      mixedAliases
    );
    console.log(
      `Found ${flowsWithMixedAliases.length} flows with mixed aliases`
    );
    flowsWithMixedAliases.forEach((flow, index) => {
      console.log(
        `   ${index + 1}. ${flow.pathAliases.join(' → ')} (${flow.totalAmount})`
      );
    });

    console.log('\n✅ Alias usage demo completed!');
  } catch (error) {
    console.error('❌ Error in alias usage demo:', error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    await aliasUsageDemo();
  } catch (error) {
    console.error('❌ Alias usage demo failed:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main();
}

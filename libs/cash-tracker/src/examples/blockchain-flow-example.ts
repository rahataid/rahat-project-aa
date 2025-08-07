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

export async function blockchainFlowExample(): Promise<void> {
  console.log('🚀 Cash Tracker SDK - Blockchain Flow Example\n');

  try {
    const config = loadConfig();
    const entities = config.entities;

    // Initialize SDK
    const sdk = new CashTokenSDK({
      network: {
        rpcUrl: config.network,
        entryPoint: config.entryPoint,
      },
      contracts: {
        cashToken: process.env.CASH_TOKEN!,
        cashtokenAbi: require('../src/artifacts/CashTokenAbi.json'),
      },
    });

    await sdk.initialize();
    console.log('✅ SDK initialized');

    // Example 1: Query flows for 3 entities (A->B->C)
    console.log('\n📊 Example 1: Query flows for 3 entities');
    console.log('-'.repeat(50));

    const threeEntities = entities
      .slice(0, 3)
      .map((entity: any) => entity.smartAccount);
    console.log(`Entities: ${threeEntities.join(' -> ')}`);

    // Start tracking these addresses
    await sdk.startFlowTracking(threeEntities);

    // Query blockchain for flows
    const flows3 = await sdk.getAllFlowsAsJSON();
    console.log(`Found ${flows3.length} flow paths`);

    for (const flow of flows3) {
      console.log(`\nPath: ${flow.path.join(' -> ')}`);
      console.log(`Total Amount: ${flow.totalAmount} CASH`);
      console.log(`Individual Flows: ${flow.flows.length}`);
    }

    // Example 2: Query flows for 4 entities (A->B->C->D)
    console.log('\n📊 Example 2: Query flows for 4 entities');
    console.log('-'.repeat(50));

    const fourEntities = entities
      .slice(0, 4)
      .map((entity: any) => entity.smartAccount);
    console.log(`Entities: ${fourEntities.join(' -> ')}`);

    // Stop previous tracking and start new
    await sdk.stopFlowTracking();
    await sdk.startFlowTracking(fourEntities);

    // Query blockchain for flows
    const flows4 = await sdk.getAllFlowsAsJSON();
    console.log(`Found ${flows4.length} flow paths`);

    for (const flow of flows4) {
      console.log(`\nPath: ${flow.path.join(' -> ')}`);
      console.log(`Total Amount: ${flow.totalAmount} CASH`);
      console.log(`Individual Flows: ${flow.flows.length}`);
    }

    // Example 3: Show detailed flow information
    console.log('\n📊 Example 3: Detailed Flow Information');
    console.log('-'.repeat(50));

    if (flows4.length > 0) {
      const firstFlow = flows4[0];
      console.log('First flow details:');
      console.log(JSON.stringify(firstFlow, null, 2));
    } else {
      console.log('No flows found. Try performing some transactions!');
    }

    await sdk.stopFlowTracking();
    console.log('\n✅ Blockchain flow example completed!');
  } catch (error) {
    console.error('❌ Error in blockchain flow example:', error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    await blockchainFlowExample();
  } catch (error) {
    console.error('❌ Blockchain flow example failed:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main();
}

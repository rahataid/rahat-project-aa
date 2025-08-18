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

// Helper function to format the comprehensive flow history
function formatTransactionFlowHistory(flowHistory: any) {
  console.log('📊 SIMPLIFIED FLOW HISTORY');
  console.log('='.repeat(50));

  // Entities with their flows
  console.log('👥 ENTITIES:');
  flowHistory.entities.forEach((entity: any) => {
    console.log(
      `   ${entity.alias}: Balance ${entity.balance}, Sent ${entity.sent}, Received ${entity.received}`
    );

    // Show pending allowances
    if (entity.pending && entity.pending.length > 0) {
      console.log(`      Pending Allowances:`);
      entity.pending.forEach((pending: any, index: number) => {
        console.log(
          `        ${index + 1}. To ${pending.to}: ${pending.amount}`
        );
      });
    } else {
      console.log(`      Pending Allowances: None`);
    }

    if (entity.flows && entity.flows.length > 0) {
      console.log(`      Flows:`);
      entity.flows.forEach((flow: any, index: number) => {
        const typeIcon = flow.type === 'sent' ? '➡️' : '⬅️';
        console.log(
          `        ${index + 1}. ${typeIcon} ${flow.from} → ${flow.to}: ${
            flow.amount
          } (${flow.type})`
        );
      });
    } else {
      console.log(`      Flows: None`);
    }
    console.log('');
  });
}

export async function flowHistoryDemo(): Promise<void> {
  console.log('🚀 Cash Tracker SDK - Transaction Flow History Demo\n');

  try {
    const config = loadConfig();
    const entities = config.entities;

    if (entities.length < 3) {
      throw new Error('Need at least 3 entities for A->B->C flow demo');
    }

    // Extract smart addresses and aliases for A->B->C flow
    const smartAddresses = entities.map((entity: any) => entity.smartAccount);
    const aliases = entities.map(
      (entity: any) =>
        entity.alias ||
        `Entity_${String.fromCharCode(65 + entities.indexOf(entity))}`
    );

    console.log('📋 ENTITIES:');
    console.log(`   Path: ${aliases.join(' → ')}`);
    console.log(
      `   Addresses: ${smartAddresses
        .map((addr: string) => addr.slice(0, 10) + '...')
        .join(' → ')}`
    );

    // Initialize SDK for blockchain queries (read-only mode)
    const flowTracker = new CashTokenSDK({
      network: {
        rpcUrl: config.network,
        entryPoint: config.entryPoint,
      },
      contracts: {
        cashToken: process.env.CASH_TOKEN!,
        cashtokenAbi: require('../src/artifacts/CashTokenAbi.json'),
      },
      // Pass entities for read-only flow tracking (without private keys)
      entities: entities.slice(0, 3).map((entity: any) => ({
        smartAccount: entity.smartAccount,
        alias:
          entity.alias ||
          `Entity_${String.fromCharCode(65 + entities.indexOf(entity))}`,
        // Don't include privateKey for read-only operations
      })),
    });

    await flowTracker.initialize();
    console.log('\n✅ SDK initialized successfully');

    // Get comprehensive transaction flow history
    console.log('\n🔍 QUERYING BLOCKCHAIN...');
    const flowHistory = await flowTracker.getTransactionFlowHistory(
      entities.slice(0, 3).map((entity: any) => ({
        smartAddress: entity.smartAccount,
        alias:
          entity.alias ||
          `Entity_${String.fromCharCode(65 + entities.indexOf(entity))}`,
      }))
    );
    console.log('first', JSON.stringify(flowHistory, null, 2));

    // Format and display the comprehensive data
    formatTransactionFlowHistory(flowHistory);

    console.log('\n✅ Demo completed successfully!');
  } catch (error) {
    console.error('❌ Error in flow history demo:', error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    await flowHistoryDemo();
  } catch (error) {
    console.error('❌ Flow history demo failed:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main();
}

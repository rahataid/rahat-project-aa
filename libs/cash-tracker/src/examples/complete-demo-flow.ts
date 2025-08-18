import * as dotenv from 'dotenv';
import { CashTokenSDK } from '../core/CashTokenSDK';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { TokenFlowData } from '../types';

// Load environment variables
dotenv.config();

// Load config from config/entities.json
const loadConfig = () => {
  const configPath = path.join(__dirname, '../config/entities.json');
  const configData = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(configData);
};

export async function completeDemoFlow(): Promise<void> {
  console.log('🚀 Starting Cash Tracker SDK Complete Demo Flow\n');

  try {
    // Load configuration from config/entities.json
    const config = loadConfig();
    const entities = config.entities;

    if (entities.length < 3) {
      throw new Error(
        'Need at least 3 entities in config for complete demo flow'
      );
    }

    console.log('📋 Demo will show three different initialization modes:');
    console.log('1. With defaultPrivatekey - for single entity operations');
    console.log('2. With connect() - for wallet connection');
    console.log(
      '3. With entities (smart addresses array) - for flow tracking\n'
    );

    // ========================================
    // MODE 1: Initialize with defaultPrivatekey
    // ========================================
    console.log('🔑 MODE 1: Initializing with defaultPrivatekey');
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

    await entity1.initialize();
    console.log(`✅ Entity 1 initialized with address: ${entity1.address}`);
    console.log(`   Smart Account: ${entity1.smartAccount}`);

    // Check balance
    const balance1 = await entity1.getCashBalance();
    console.log(`   Balance: ${balance1.formatted} ${balance1.symbol}\n`);

    // ========================================
    // MODE 2: Initialize with connect()
    // ========================================
    console.log('🔗 MODE 2: Initializing with connect()');
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
      },
    });

    await entity2.initialize();
    entity2.connect(entities[1].privateKey);
    console.log(`✅ Entity 2 initialized with address: ${entity2.address}`);
    console.log(`   Smart Account: ${entity2.smartAccount}`);

    // Check balance
    const balance2 = await entity2.getCashBalance();
    console.log(`   Balance: ${balance2.formatted} ${balance2.symbol}\n`);

    // ========================================
    // MODE 3: Initialize with entities (smart addresses array)
    // ========================================
    console.log(
      '📊 MODE 3: Initializing with entities (smart addresses array)'
    );

    // Extract smart addresses from entities
    const smartAddresses = entities.map((entity: any) => entity.smartAccount);
    console.log(`   Smart addresses to track: ${smartAddresses.join(', ')}`);

    // 3. Initialize SDK for flow tracking
    const flowTracker = new CashTokenSDK({
      network: {
        rpcUrl: config.network,
        entryPoint: config.entryPoint,
      },
      contracts: {
        cashToken: process.env.CASH_TOKEN!,
        cashtokenAbi: require('../src/artifacts/CashTokenAbi.json'),
      },
      entities: smartAddresses,
    });

    await flowTracker.initialize();
    console.log('✅ Flow tracker initialized successfully');

    // Set up flow tracking callback
    const onFlowUpdate = (flowData: TokenFlowData) => {
      console.log('\n🔄 Flow Update Detected!');
      console.log(
        `Timestamp: ${new Date(flowData.timestamp).toLocaleTimeString()}`
      );

      if (flowData.flows.length > 0) {
        console.log('📊 Recent Flows:');
        for (const flow of flowData.flows) {
          const direction = flow.type === 'balance_change' ? '↔' : '→';
          console.log(
            `  ${flow.from} ${direction} ${flow.to}: ${flow.formatted} CASH (${flow.type})`
          );
        }
      }

      console.log('\n💰 Current Balances:');
      for (const balance of flowData.balances) {
        console.log(
          `  ${balance.entityId}: ${balance.formatted} ${balance.symbol}`
        );
      }

      console.log('\n🔐 Current Allowances:');
      for (const allowance of flowData.allowances) {
        if (allowance.allowance > 0n) {
          console.log(
            `  ${allowance.ownerId} → ${allowance.spenderId}: ${allowance.formatted} CASH`
          );
        }
      }
      console.log('─'.repeat(50));
    };

    // Start flow tracking
    console.log('\n🚀 Starting flow tracking...');
    await flowTracker.startFlowTracking(smartAddresses, {
      interval: 5000, // Update every 5 seconds
      onFlowUpdate,
    });

    // Display initial status
    console.log('\n📊 Initial Flow Status:');
    await flowTracker.displayFlowStatus();

    // ========================================
    // DEMONSTRATE INTERACTIONS BETWEEN MODES
    // ========================================
    console.log('\n🔄 DEMONSTRATING INTERACTIONS BETWEEN MODES');

    // Give allowance from Entity 2 to Entity 1
    console.log('\n🔐 Entity 2 giving allowance to Entity 1...');
    try {
      const allowanceResult = await entity2.giveCashAllowance(
        entity1.smartAccount!,
        '0.3'
      );
      console.log(
        `✅ Allowance transaction confirmed: ${allowanceResult.hash}`
      );
    } catch (error) {
      console.log('⚠️  Allowance transaction failed:', error);
    }

    // Wait a moment for flow tracking to detect the change
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Transfer cash from Entity 2 to Entity 1
    console.log('\n💸 Entity 1 getting cash from Entity 2...');
    try {
      const transferResult = await entity1.getCashFrom(
        entity2.smartAccount!,
        '0.2'
      );
      console.log(`✅ Transfer transaction confirmed: ${transferResult.hash}`);
    } catch (error) {
      console.log('⚠️  Transfer transaction failed:', error);
    }

    // Wait a moment for flow tracking to detect the change
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check final balances
    console.log('\n💰 Final Balances:');
    const finalBalance1 = await entity1.getCashBalance();
    const finalBalance2 = await entity2.getCashBalance();
    console.log(`Entity 1: ${finalBalance1.formatted} ${finalBalance1.symbol}`);
    console.log(`Entity 2: ${finalBalance2.formatted} ${finalBalance2.symbol}`);

    // Manual flow data retrieval
    console.log('\n📈 Manual Flow Data Retrieval:');
    try {
      const flowData = await flowTracker.getFlowData();
      console.log(
        `Current timestamp: ${new Date(
          flowData.timestamp
        ).toLocaleTimeString()}`
      );
      console.log(`Tracking ${flowData.balances.length} addresses`);
      console.log(`Found ${flowData.flows.length} recent flows`);
      console.log(`Found ${flowData.allowances.length} allowances`);
    } catch (error) {
      console.error('❌ Error getting flow data:', error);
    }

    // Keep the demo running for a while to show real-time updates
    console.log('\n⏰ Flow tracking will continue for 20 seconds...');
    console.log(
      '💡 You can trigger more transactions to see additional flow updates!'
    );

    // Set up graceful shutdown
    const shutdown = async () => {
      console.log('\n🛑 Stopping flow tracking...');
      await flowTracker.stopFlowTracking();
      console.log('✅ Complete demo flow completed!');
      process.exit(0);
    };

    // Handle Ctrl+C
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Auto-stop after 20 seconds
    setTimeout(async () => {
      await shutdown();
    }, 20000);
  } catch (error) {
    console.error('❌ Error in complete demo flow:', error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    await completeDemoFlow();
  } catch (error) {
    console.error('❌ Complete demo flow failed:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main();
}

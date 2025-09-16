import { ethers } from 'ethers';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

interface WalletInfo {
  address: string;
  privateKey: string;
  mnemonic?: string;
}

interface DeploymentKeys {
  timestamp: string;
  wallets: {
    deployer: WalletInfo;
    admin: WalletInfo;
    operator: WalletInfo;
    treasury: WalletInfo;
  };
  network: string;
}

/**
 * Generates deployment keys and wallets using ethers.js
 * @param network - The network name (default: 'development')
 * @param count - Number of wallets to generate (default: 4)
 */
export function generateDeploymentKeys(network: string = 'development', count: number = 4): DeploymentKeys {
  console.log(`🔑 Generating ${count} deployment wallets for ${network}...`);

  // Create wallets
  const walletNames = ['admin'];
  const wallets: Record<string, WalletInfo> = {};

  for (let i = 0; i < count; i++) {
    const wallet = ethers.Wallet.createRandom();
    const walletName = walletNames[i] || `wallet_${i}`;
    
    wallets[walletName] = {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic?.phrase
    };

    console.log(`✅ Generated ${walletName}: ${wallet.address}`);
  }

  const deploymentKeys: DeploymentKeys = {
    timestamp: new Date().toISOString(),
    wallets: wallets as any,
    network
  };

  return deploymentKeys;
}

/**
 * Saves deployment keys to a JSON file in the deployments directory
 * @param keys - The deployment keys to save
 * @param filename - Optional filename (default: generated based on network and timestamp)
 */
export function saveDeploymentKeys(keys: DeploymentKeys, filename?: string): string {
  const deploymentsDir = `${__dirname}/deployments`;
  
  // Create deployments directory if it doesn't exist
  if (!existsSync(deploymentsDir)) {
    mkdirSync(deploymentsDir, { recursive: true });
    console.log(`📁 Created deployments directory: ${deploymentsDir}`);
  }

  // Generate filename if not provided
  if (!filename) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    filename = `deployment-keys-${keys.network}-${timestamp}.json`;
  }

  const filepath = join(deploymentsDir, filename);

  // Save to file with proper formatting
  writeFileSync(filepath, JSON.stringify(keys, null, 2), 'utf8');
  
  console.log(`💾 Deployment keys saved to: ${filepath}`);
  return filepath;
}

/**
 * Generates and saves deployment keys in one operation
 * @param network - The network name
 * @param filename - Optional filename
 */
export function generateAndSaveKeys(network: string = 'development', filename?: string): string {
  const keys = generateDeploymentKeys(network);
  return saveDeploymentKeys(keys, filename);
}

/**
 * Main execution function
 */
export function main() {
  try {
    const network = process.env.NETWORK || 'development';
    const filepath = generateAndSaveKeys(network);
    
    console.log('\n🎉 Deployment keys generation completed successfully!');
    console.log(`📍 File location: ${filepath}`);
    console.log('\n⚠️  SECURITY WARNING: Keep these private keys secure and never commit them to version control!');
    
  } catch (error) {
    console.error('❌ Error generating deployment keys:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}
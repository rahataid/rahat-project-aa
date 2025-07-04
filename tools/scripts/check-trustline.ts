import { PrismaClient } from '@prisma/client';
import { ReceiveService, TransactionService } from '../../libs/stellar-sdk/src';

// Types
interface BeneficiarySecret {
  address: string;
  privateKey: string;
  publicKey: string;
}

interface NotFoundBen {
  walletAddress: string;
  uuid: string;
}

interface NoTrustlineBen {
  walletAddress: string;
  secretKey: string;
}

// Initialize services
const prisma = new PrismaClient();

// Initialize Stellar services
let receiveService: ReceiveService;
let transactionService: TransactionService;

async function initializeServices() {
  const stellarSettings = await prisma.setting.findUnique({
    where: { name: 'STELLAR_SETTINGS' },
  });

  if (!stellarSettings?.value) {
    throw new Error('STELLAR_SETTINGS not found');
  }

  const settings = stellarSettings.value as any;

  receiveService = new ReceiveService(
    settings.ASSETCREATOR,
    settings.ASSETCODE,
    settings.NETWORK,
    settings.FAUCETSECRETKEY,
    settings.FAUCETAUTHKEY,
    settings.FAUCETBASEURL
  );

  transactionService = new TransactionService(
    settings.ASSETCREATOR,
    settings.ASSETCODE,
    settings.ASSETCREATORSECRET
  );
}

// Mock function to get beneficiary secret - replace with actual implementation
async function getSecretByWallet(
  walletAddress: string
): Promise<BeneficiarySecret | null> {
  try {
    // TODO: Replace with actual microservice call to get beneficiary secret
    // For now, this is a placeholder that returns null
    console.log(`⚠️  Placeholder: Getting secret for wallet: ${walletAddress}`);
    console.log(
      `   You need to implement the actual microservice call to get beneficiary secrets`
    );
    return null;
  } catch (error) {
    console.log(
      `❌ Couldn't find secret for wallet ${walletAddress}:`,
      error.message
    );
    return null;
  }
}

async function checkTrustline(walletAddress: string): Promise<boolean> {
  try {
    return await transactionService.hasTrustline(walletAddress);
  } catch (error) {
    console.error(`Error checking trustline for ${walletAddress}:`, error);
    return false;
  }
}

async function addTrustline(
  walletAddress: string,
  secretKey: string
): Promise<void> {
  try {
    await receiveService.faucetAndTrustlineService(walletAddress, secretKey);
    console.log(`✅ Added trustline for ${walletAddress}`);
  } catch (error) {
    console.error(`❌ Failed to add trustline for ${walletAddress}:`, error);
    throw error;
  }
}

async function checkBulkTrustline(mode: 'dry' | 'live' = 'dry'): Promise<void> {
  console.log(`🚀 Starting bulk trustline check in ${mode} mode...\n`);

  try {
    // Get all beneficiaries
    const beneficiaries = await prisma.beneficiary.findMany({
      where: { deletedAt: null },
    });

    if (!beneficiaries.length) {
      console.log('⚠️  No beneficiaries found');
      return;
    }

    console.log(`📊 Found ${beneficiaries.length} beneficiaries to check\n`);

    const walletAndUuid = beneficiaries.map((beneficiary) => ({
      walletAddress: beneficiary.walletAddress,
      uuid: beneficiary.uuid,
    }));

    let notFoundBen: NotFoundBen[] = [];
    let noTrustlineBen: NoTrustlineBen[] = [];

    // Check each beneficiary
    for (const wallet of walletAndUuid) {
      console.log(`🔍 Checking wallet: ${wallet.walletAddress}`);

      const secret = await getSecretByWallet(wallet.walletAddress);

      if (!secret) {
        console.log(`❌ Secret not found for wallet: ${wallet.walletAddress}`);
        notFoundBen.push({
          walletAddress: wallet.walletAddress,
          uuid: wallet.uuid,
        });
        continue;
      }

      console.log(`✅ Wallet found: ${secret.address}, checking trustline...`);
      const hasTrustline = await checkTrustline(secret.address);

      if (!hasTrustline) {
        console.log(
          `❌ Trustline not found for wallet: ${wallet.walletAddress}`
        );
        noTrustlineBen.push({
          walletAddress: secret.address,
          secretKey: secret.privateKey,
        });
      } else {
        console.log(`✅ Trustline found for wallet: ${wallet.walletAddress}`);
      }
    }

    // Summary
    console.log('\n📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total beneficiaries: ${beneficiaries.length}`);
    console.log(`Without wallet: ${notFoundBen.length}`);
    console.log(`Without trustline: ${noTrustlineBen.length}`);
    console.log(
      `Already have trustline: ${
        beneficiaries.length - notFoundBen.length - noTrustlineBen.length
      }`
    );

    // Stop if dry mode
    if (mode !== 'live') {
      if (notFoundBen.length > 0) {
        console.log('\n⚠️  Beneficiaries without wallet:');
        notFoundBen.forEach((ben) => {
          console.log(`   - ${ben.uuid}: ${ben.walletAddress}`);
        });
      }

      if (noTrustlineBen.length > 0) {
        console.log('\n⚠️  Beneficiaries without trustline:');
        noTrustlineBen.forEach((ben) => {
          console.log(`   - ${ben.walletAddress}`);
        });
      }

      console.log('\n🔍 Dry run completed. Run with --live to apply changes.');
      return;
    }

    // Live mode - apply changes
    console.log('\n🔄 Applying changes in live mode...');

    // Add trustlines for beneficiaries without trustlines
    if (noTrustlineBen.length > 0) {
      console.log(
        `\n🔗 Adding trustlines for ${noTrustlineBen.length} beneficiaries...`
      );

      for (const ben of noTrustlineBen) {
        try {
          await addTrustline(ben.walletAddress, ben.secretKey);
        } catch (error) {
          console.error(
            `Failed to add trustline for ${ben.walletAddress}:`,
            error
          );
        }
      }

      console.log(
        `✅ Completed adding trustlines for ${noTrustlineBen.length} beneficiaries`
      );
    }

    console.log('\n🎉 Bulk trustline check completed successfully!');
  } catch (error) {
    console.error('❌ Error in bulk trustline check:', error);
    throw error;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--live') ? 'live' : 'dry';

  try {
    console.log('🔧 Initializing services...');
    await initializeServices();

    await checkBulkTrustline(mode);
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Show usage
function showUsage(): void {
  console.log(`
🔗 Bulk Trustline Check Script

Usage:
  npm run check-trustline [options]
  node check-trustline.ts [options]

Options:
  --live    Apply changes (default: dry run)
  --help    Show this help message

Examples:
  # Dry run (check only, no changes)
  node check-trustline.ts

  # Live run (apply changes)
  node check-trustline.ts --live

Note:
  This script currently has a placeholder for getting beneficiary secrets.
  You need to implement the actual microservice call to get beneficiary secrets
  by replacing the getSecretByWallet function with the actual implementation.

Environment Variables:
  REDIS_HOST      Redis host (default: localhost)
  REDIS_PORT      Redis port (default: 6379)
  REDIS_PASSWORD  Redis password
`);
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsage();
  process.exit(0);
}

// Run the script
main();

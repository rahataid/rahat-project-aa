import {
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma';

async function createRahatAssetOnMainnet() {
  console.log('🚀 Creating RAHAT asset on mainnet...\n');

  // Initialize services
  const prismaService = new PrismaService();
  const settingsService = new SettingsService(prismaService);

  try {
    // Get Stellar settings
    const settings = await settingsService.getPublic('STELLAR_SETTINGS');
    const settingsValue = settings?.value as any;

    const assetCode = settingsValue?.['ASSETCODE'];
    const assetIssuer = settingsValue?.['ASSETCREATOR'];
    const assetSecret = settingsValue?.['ASSETCREATORSECRET'];
    const horizonServer = settingsValue?.['HORIZONURL'];
    const network = settingsValue?.['NETWORK'];

    console.log('📋 Configuration:');
    console.log('  Asset Code:', assetCode);
    console.log('  Asset Issuer:', assetIssuer);
    console.log('  Horizon Server:', horizonServer);
    console.log('  Network:', network);
    console.log('');

    if (!assetSecret) {
      console.error('❌ Asset creator secret key not found in settings');
      console.log('💡 Make sure ASSETCREATORSECRET is set in STELLAR_SETTINGS');
      return;
    }

    if (network !== 'mainnet') {
      console.error('❌ Network is not set to mainnet');
      console.log('💡 Current network:', network);
      console.log('💡 Please set NETWORK to "mainnet" in STELLAR_SETTINGS');
      return;
    }

    // Initialize Stellar server
    const server = new Horizon.Server(horizonServer);
    const issuerKeypair = Keypair.fromSecret(assetSecret);

    console.log('🔍 Checking issuer account...');
    const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());
    console.log('✅ Issuer account loaded');
    console.log('  Account ID:', issuerAccount.accountId);
    console.log(
      '  XLM Balance:',
      issuerAccount.balances.find((b) => b.asset_type === 'native')?.balance
    );

    // Check if RAHAT asset already exists
    const existingRahat = issuerAccount.balances.find(
      (balance: any) => balance.asset_code === assetCode
    );

    if (existingRahat) {
      console.log('✅ RAHAT asset already exists!');
      console.log('  Balance:', existingRahat.balance);
      console.log('  Asset Type:', existingRahat.asset_type);
      return;
    }

    console.log('❌ RAHAT asset not found. Creating it...');

    // Create a test account to receive the asset
    const testAccount = Keypair.random();
    console.log('  Test Account Public Key:', testAccount.publicKey());
    console.log('  Test Account Secret Key:', testAccount.secret());

    // Fund the test account with XLM
    console.log('💰 Funding test account with XLM...');
    const fundTransaction = new TransactionBuilder(issuerAccount, {
      fee: (await server.fetchBaseFee()).toString(),
      networkPassphrase: Networks.PUBLIC,
    })
      .addOperation(
        Operation.createAccount({
          destination: testAccount.publicKey(),
          startingBalance: '1',
        })
      )
      .setTimeout(30)
      .build();

    fundTransaction.sign(issuerKeypair);
    const fundResult = await server.submitTransaction(fundTransaction);
    console.log('✅ Test account funded successfully');
    console.log('  Transaction Hash:', fundResult.hash);

    // Wait a moment for the transaction to be processed
    console.log('⏳ Waiting for transaction to be processed...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Load the test account
    const testAccountLoaded = await server.loadAccount(testAccount.publicKey());
    console.log('✅ Test account loaded');

    // Create the RAHAT asset
    const rahatAsset = new Asset(assetCode, issuerKeypair.publicKey());

    // Add trustline for the test account
    console.log('🔗 Adding trustline for RAHAT asset...');
    const trustlineTransaction = new TransactionBuilder(testAccountLoaded, {
      fee: (await server.fetchBaseFee()).toString(),
      networkPassphrase: Networks.PUBLIC,
    })
      .addOperation(
        Operation.changeTrust({
          asset: rahatAsset,
          limit: '1000000', // Set a reasonable limit
        })
      )
      .setTimeout(30)
      .build();

    trustlineTransaction.sign(testAccount);
    const trustlineResult = await server.submitTransaction(
      trustlineTransaction
    );
    console.log('✅ Trustline added successfully');
    console.log('  Transaction Hash:', trustlineResult.hash);

    // Wait a moment for the transaction to be processed
    console.log('⏳ Waiting for trustline transaction to be processed...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Send RAHAT tokens to the test account
    console.log('🎁 Sending RAHAT tokens to test account...');
    const paymentTransaction = new TransactionBuilder(issuerAccount, {
      fee: (await server.fetchBaseFee()).toString(),
      networkPassphrase: Networks.PUBLIC,
    })
      .addOperation(
        Operation.payment({
          destination: testAccount.publicKey(),
          asset: rahatAsset,
          amount: '1000', // Send 1000 RAHAT tokens
        })
      )
      .setTimeout(30)
      .build();

    paymentTransaction.sign(issuerKeypair);
    const paymentResult = await server.submitTransaction(paymentTransaction);
    console.log('✅ RAHAT tokens sent successfully');
    console.log('  Transaction Hash:', paymentResult.hash);

    // Verify the asset was created
    console.log('🔍 Verifying asset creation...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const updatedIssuerAccount = await server.loadAccount(
      issuerKeypair.publicKey()
    );
    const rahatBalance = updatedIssuerAccount.balances.find(
      (balance: any) => balance.asset_code === assetCode
    );

    if (rahatBalance) {
      console.log('🎉 RAHAT asset created successfully!');
      console.log('  Issuer Balance:', rahatBalance.balance);
      console.log('  Asset Type:', rahatBalance.asset_type);
    } else {
      console.log('❌ RAHAT asset not found in issuer account after creation');
    }

    console.log('\n📝 Summary:');
    console.log('  Test Account Public Key:', testAccount.publicKey());
    console.log('  Test Account Secret Key:', testAccount.secret());
    console.log('  Fund Transaction:', fundResult.hash);
    console.log('  Trustline Transaction:', trustlineResult.hash);
    console.log('  Payment Transaction:', paymentResult.hash);
  } catch (error: any) {
    console.error('❌ Error creating RAHAT asset:', error.message);
    if (error.response?.data) {
      console.error('  Response data:', error.response.data);
    }
  } finally {
    await prismaService.$disconnect();
  }
}

// Run the script
createRahatAssetOnMainnet()
  .then(() => {
    console.log('\n🎉 Asset creation process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Asset creation failed:', error);
    process.exit(1);
  });

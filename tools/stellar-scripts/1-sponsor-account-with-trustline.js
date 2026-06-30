require('dotenv').config({ path: __dirname + '/.env' });
const {
    Horizon,
    Keypair,
    Networks,
    TransactionBuilder,
    Operation,
    Asset,
    BASE_FEE
} = require('@stellar/stellar-sdk');

const NETWORK = process.env.NETWORK;
const serverUrl = NETWORK === 'MAINNET' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
const networkPassphrase = NETWORK === 'MAINNET' ? Networks.PUBLIC : Networks.TESTNET;

console.log('Network:', NETWORK);
console.log('Server:', serverUrl);

const server = new Horizon.Server(serverUrl);

async function sponsorAccountWithTrustline() {
    try {
        // Sponsor (has funds)
        const sponsorKeypair = Keypair.fromSecret(process.env.DISTRIBUTOR_SECRET);
        console.log('\n💰 Sponsor:', sponsorKeypair.publicKey());

        // RAHAT asset
        const rahatAsset = new Asset(process.env.ASSET_CODE, process.env.ISSUER_PUBLIC);
        console.log('🪙 Asset:', process.env.ASSET_CODE);

        // New account to be sponsored (generated fresh)
        const sponsoredKeypair = Keypair.random();
        console.log('🎯 Sponsored Account:', sponsoredKeypair.publicKey());
        console.log('🔑 Sponsored Secret:', sponsoredKeypair.secret());

        // Load sponsor account
        const sponsorAccount = await server.loadAccount(sponsorKeypair.publicKey());

        console.log('\n📝 Building sponsorship transaction (account + trustline)...');

        // Build transaction: sponsor account creation AND trustline in one tx
        const transaction = new TransactionBuilder(sponsorAccount, {
            fee: (BASE_FEE * 5).toString(), // 5 operations total
            networkPassphrase,
        })
            // Begin sponsoring for account creation
            .addOperation(Operation.beginSponsoringFutureReserves({
                sponsoredId: sponsoredKeypair.publicKey(),
            }))
            // Create the account (sponsored)
            .addOperation(Operation.createAccount({
                destination: sponsoredKeypair.publicKey(),
                startingBalance: '0', // 0 XLM since sponsor pays reserves
            }))
            // End sponsoring for account (must close this session)
            .addOperation(Operation.endSponsoringFutureReserves({
                source: sponsoredKeypair.publicKey(),
            }))
            // Begin sponsoring for trustline
            .addOperation(Operation.beginSponsoringFutureReserves({
                sponsoredId: sponsoredKeypair.publicKey(),
            }))
            // Create trustline (sponsored)
            .addOperation(Operation.changeTrust({
                asset: rahatAsset,
                source: sponsoredKeypair.publicKey(),
            }))
            // End sponsoring for trustline
            .addOperation(Operation.endSponsoringFutureReserves({
                source: sponsoredKeypair.publicKey(),
            }))
            .setTimeout(100)
            .build();

        // Both accounts must sign
        transaction.sign(sponsorKeypair); // Sponsor signs
        transaction.sign(sponsoredKeypair); // Sponsored account agrees

        console.log('📤 Submitting transaction...');
        const result = await server.submitTransaction(transaction);

        console.log('\n✅ Account + Trustline sponsored successfully!');
        console.log('=====================================');
        console.log('Sponsor:', sponsorKeypair.publicKey());
        console.log('Sponsored Account:', sponsoredKeypair.publicKey());
        console.log('Sponsored Secret:', sponsoredKeypair.secret());
        console.log('Asset:', process.env.ASSET_CODE);
        console.log('Transaction Hash:', result.hash);
        console.log('=====================================');
        console.log('\n💡 Save the sponsored secret key!');
        console.log('Account created with 0 XLM and RAHAT trustline ready');

        // Verify sponsorship and trustline
        console.log('\n🔍 Verifying...');
        const sponsoredAccount = await server.loadAccount(sponsoredKeypair.publicKey());
        console.log('Balances:', sponsoredAccount.balances);
        console.log('Num Sponsored:', sponsoredAccount.num_sponsored);

        const hasTrustline = sponsoredAccount.balances.some(
            b => b.asset_code === process.env.ASSET_CODE
        );
        console.log('RAHAT Trustline:', hasTrustline ? '✅ Ready' : '❌ Missing');

    } catch (error) {
        console.error('\n❌ Error:', error.response?.data || error.message);
        if (error.response?.data?.extras?.result_codes) {
            console.log('Result codes:', error.response.data.extras.result_codes);
        }
    }
}

if (require.main === module) {
    sponsorAccountWithTrustline();
}

module.exports = { sponsorAccountWithTrustline };

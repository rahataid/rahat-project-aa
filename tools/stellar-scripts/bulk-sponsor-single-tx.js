require('dotenv').config({ path: __dirname + '/.env' });
const fs = require('fs');
const path = require('path');
const readline = require('readline');
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

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function bulkSponsorWithTrustline() {
    try {
        // Sponsor
        const sponsorKeypair = Keypair.fromSecret(process.env.DISTRIBUTOR_SECRET);
        console.log('\n💰 Sponsor:', sponsorKeypair.publicKey());

        // RAHAT asset
        const rahatAsset = new Asset(process.env.ASSET_CODE, process.env.ISSUER_PUBLIC);
        console.log('🪙 Asset:', process.env.ASSET_CODE);

        // Get number of accounts
        const count = await new Promise(resolve => {
            rl.question('How many accounts to sponsor? (max 16): ', resolve);
        });
        const numAccounts = Math.min(parseInt(count), 16); // Signature limit: 20 - 1 sponsor = 19, conservative 16

        console.log(`\n🎲 Generating ${numAccounts} keypairs...`);

        // Pre-generate all keypairs
        const sponsoredKeypairs = [];
        for (let i = 0; i < numAccounts; i++) {
            sponsoredKeypairs.push(Keypair.random());
        }

        console.log('\n📝 Building bulk sponsorship transaction...');
        console.log(`Operations per account: 6 (begin, create, end, begin, trustline, end)`);
        console.log(`Total operations: ${numAccounts * 6}`);

        // Load sponsor account
        const sponsorAccount = await server.loadAccount(sponsorKeypair.publicKey());

        // Build transaction with all accounts
        let txBuilder = new TransactionBuilder(sponsorAccount, {
            fee: (BASE_FEE * numAccounts * 6).toString(), // 6 ops per account
            networkPassphrase,
        });

        // Add operations for each account
        for (let i = 0; i < numAccounts; i++) {
            const sponsored = sponsoredKeypairs[i];

            // Sponsor account creation
            txBuilder
                .addOperation(Operation.beginSponsoringFutureReserves({
                    sponsoredId: sponsored.publicKey(),
                }))
                .addOperation(Operation.createAccount({
                    destination: sponsored.publicKey(),
                    startingBalance: '0',
                }))
                .addOperation(Operation.endSponsoringFutureReserves({
                    source: sponsored.publicKey(),
                }));

            // Sponsor trustline
            txBuilder
                .addOperation(Operation.beginSponsoringFutureReserves({
                    sponsoredId: sponsored.publicKey(),
                }))
                .addOperation(Operation.changeTrust({
                    asset: rahatAsset,
                    source: sponsored.publicKey(),
                }))
                .addOperation(Operation.endSponsoringFutureReserves({
                    source: sponsored.publicKey(),
                }));
        }

        const transaction = txBuilder.setTimeout(100).build();

        console.log('✍️  Signing transaction...');

        // Sponsor signs
        transaction.sign(sponsorKeypair);

        // All sponsored accounts must sign
        for (let i = 0; i < numAccounts; i++) {
            transaction.sign(sponsoredKeypairs[i]);
        }

        console.log(`📤 Submitting transaction with ${numAccounts} accounts...`);
        const result = await server.submitTransaction(transaction);

        console.log('\n✅ Bulk sponsorship successful!');
        console.log('=====================================');
        console.log('Sponsor:', sponsorKeypair.publicKey());
        console.log('Accounts Created:', numAccounts);
        console.log('Asset:', process.env.ASSET_CODE);
        console.log('Transaction Hash:', result.hash);
        console.log('=====================================');

        // Prepare accounts data
        const accountsData = {
            sponsor: sponsorKeypair.publicKey(),
            asset: process.env.ASSET_CODE,
            network: NETWORK,
            timestamp: new Date().toISOString(),
            transactionHash: result.hash,
            accounts: []
        };

        console.log('\n🔑 Sponsored Accounts:');
        console.log('=====================================');
        for (let i = 0; i < numAccounts; i++) {
            const account = {
                index: i + 1,
                publicKey: sponsoredKeypairs[i].publicKey(),
                secretKey: sponsoredKeypairs[i].secret()
            };
            accountsData.accounts.push(account);

            console.log(`\nAccount ${i + 1}:`);
            console.log('Public:', account.publicKey);
            console.log('Secret:', account.secretKey);
        }
        console.log('=====================================');

        // Save to JSON file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `sponsored-accounts-${timestamp}.json`;
        const filepath = path.join(__dirname, filename);

        fs.writeFileSync(filepath, JSON.stringify(accountsData, null, 2));
        console.log(`\n💾 Accounts saved to: ${filename}`);

        // Verify a sample account
        console.log('\n🔍 Verifying first account...');
        const sampleAccount = await server.loadAccount(sponsoredKeypairs[0].publicKey());
        console.log('Balances:', sampleAccount.balances);
        const hasTrustline = sampleAccount.balances.some(
            b => b.asset_code === process.env.ASSET_CODE
        );
        console.log('RAHAT Trustline:', hasTrustline ? '✅ Ready' : '❌ Missing');

    } catch (error) {
        console.error('\n❌ Error:', error.response?.data || error.message);
        if (error.response?.data?.extras?.result_codes) {
            console.log('Result codes:', error.response.data.extras.result_codes);
        }
    } finally {
        rl.close();
    }
}

if (require.main === module) {
    bulkSponsorWithTrustline();
}

module.exports = { bulkSponsorWithTrustline };

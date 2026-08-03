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

async function bulkSponsorBatch() {
    try {
        // Sponsor
        const sponsorKeypair = Keypair.fromSecret(process.env.DISTRIBUTOR_SECRET);
        console.log('\n💰 Sponsor:', sponsorKeypair.publicKey());

        // RAHAT asset
        const rahatAsset = new Asset(process.env.ASSET_CODE, process.env.ISSUER_PUBLIC);
        console.log('🪙 Asset:', process.env.ASSET_CODE);

        // Get number of accounts
        const count = await new Promise(resolve => {
            rl.question('How many accounts to sponsor? ', resolve);
        });
        const numAccounts = parseInt(count);

        // Get batch size
        const batchSizeInput = await new Promise(resolve => {
            rl.question('Accounts per transaction? (recommended: 10-16): ', resolve);
        });
        const batchSize = parseInt(batchSizeInput) || 10;

        console.log(`\n🎲 Generating ${numAccounts} keypairs...`);

        // Pre-generate all keypairs
        const allKeypairs = [];
        for (let i = 0; i < numAccounts; i++) {
            allKeypairs.push(Keypair.random());
        }

        const batches = [];
        for (let i = 0; i < allKeypairs.length; i += batchSize) {
            batches.push(allKeypairs.slice(i, i + batchSize));
        }

        console.log(`\n📦 Processing ${batches.length} batches...`);

        const batchResults = [];

        for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
            const batch = batches[batchIdx];
            console.log(`\n📝 Batch ${batchIdx + 1}/${batches.length} (${batch.length} accounts)...`);

            // Reload sponsor account for fresh sequence
            const sponsorAccount = await server.loadAccount(sponsorKeypair.publicKey());

            // Build transaction for this batch
            let txBuilder = new TransactionBuilder(sponsorAccount, {
                fee: (BASE_FEE * batch.length * 6).toString(), // 6 ops per account
                networkPassphrase,
            });

            for (let i = 0; i < batch.length; i++) {
                const sponsored = batch[i];

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

            // Sign with sponsor
            transaction.sign(sponsorKeypair);

            // Sign with all accounts in batch
            for (let i = 0; i < batch.length; i++) {
                transaction.sign(batch[i]);
            }

            console.log(`📤 Submitting batch ${batchIdx + 1}...`);
            const result = await server.submitTransaction(transaction);

            batchResults.push({
                batchIndex: batchIdx + 1,
                count: batch.length,
                hash: result.hash,
                keypairs: batch
            });

            console.log(`✅ Batch ${batchIdx + 1} complete! Hash: ${result.hash}`);

            // Small delay between batches to avoid rate limits
            if (batchIdx < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.log('\n✅ All batches completed!');
        console.log('=====================================');
        console.log('Sponsor:', sponsorKeypair.publicKey());
        console.log('Total Accounts Created:', numAccounts);
        console.log('Total Batches:', batches.length);
        console.log('Asset:', process.env.ASSET_CODE);
        console.log('=====================================');

        // Prepare accounts data
        const accountsData = {
            sponsor: sponsorKeypair.publicKey(),
            asset: process.env.ASSET_CODE,
            network: NETWORK,
            timestamp: new Date().toISOString(),
            totalAccounts: numAccounts,
            batches: batchResults.map(b => ({
                batchIndex: b.batchIndex,
                count: b.count,
                transactionHash: b.hash
            })),
            accounts: []
        };

        console.log('\n🔑 All Sponsored Accounts:');
        console.log('=====================================');
        let accountNum = 1;
        for (const result of batchResults) {
            console.log(`\n--- Batch ${result.batchIndex} (Tx: ${result.hash}) ---`);
            for (const keypair of result.keypairs) {
                const account = {
                    index: accountNum,
                    publicKey: keypair.publicKey(),
                    secretKey: keypair.secret(),
                    batch: result.batchIndex
                };
                accountsData.accounts.push(account);

                console.log(`\nAccount ${accountNum}:`);
                console.log('Public:', account.publicKey);
                console.log('Secret:', account.secretKey);
                accountNum++;
            }
        }
        console.log('=====================================');

        // Save to JSON file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `sponsored-accounts-batch-${timestamp}.json`;
        const filepath = path.join(__dirname, filename);

        fs.writeFileSync(filepath, JSON.stringify(accountsData, null, 2));
        console.log(`\n💾 Accounts saved to: ${filename}`);

        console.log('\n💡 All accounts have 0 XLM and RAHAT trustline ready!');

        // Verify first and last account
        console.log('\n🔍 Verifying first account...');
        const firstAccount = await server.loadAccount(allKeypairs[0].publicKey());
        const firstXlm = firstAccount.balances.find(b => b.asset_type === 'native')?.balance;
        const firstHasTrustline = firstAccount.balances.some(b => b.asset_code === process.env.ASSET_CODE);
        console.log('XLM Balance:', firstXlm);
        console.log('RAHAT Trustline:', firstHasTrustline ? '✅ Ready' : '❌ Missing');

        console.log('\n🔍 Verifying last account...');
        const lastAccount = await server.loadAccount(allKeypairs[allKeypairs.length - 1].publicKey());
        const lastXlm = lastAccount.balances.find(b => b.asset_type === 'native')?.balance;
        const lastHasTrustline = lastAccount.balances.some(b => b.asset_code === process.env.ASSET_CODE);
        console.log('XLM Balance:', lastXlm);
        console.log('RAHAT Trustline:', lastHasTrustline ? '✅ Ready' : '❌ Missing');

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
    bulkSponsorBatch();
}

module.exports = { bulkSponsorBatch };

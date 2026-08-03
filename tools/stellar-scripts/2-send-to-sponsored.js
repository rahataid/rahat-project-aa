require('dotenv').config({ path: __dirname + '/.env' });
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

async function sendToSponsored() {
    try {
        // Distributor (has RAHAT)
        const distributorKeypair = Keypair.fromSecret(process.env.DISTRIBUTOR_SECRET);
        console.log('\n📤 Sender:', distributorKeypair.publicKey());

        // RAHAT asset
        const rahatAsset = new Asset(process.env.ASSET_CODE, process.env.ISSUER_PUBLIC);
        console.log('🪙 Asset:', process.env.ASSET_CODE);

        // Get sponsored account public key
        const sponsoredPublic = await new Promise(resolve => {
            rl.question('Enter sponsored account public key: ', resolve);
        });
        console.log('🎯 Recipient (Sponsored):', sponsoredPublic);

        // Get amount
        const amount = await new Promise(resolve => {
            rl.question('Enter RAHAT amount to send: ', resolve);
        });

        console.log('\n📝 Building payment transaction...');

        // Verify trustline exists
        const sponsoredAccount = await server.loadAccount(sponsoredPublic);
        const hasTrustline = sponsoredAccount.balances.some(
            b => b.asset_code === process.env.ASSET_CODE && b.asset_issuer === process.env.ISSUER_PUBLIC
        );

        if (!hasTrustline) {
            console.log('\n❌ Sponsored account does not have RAHAT trustline!');
            console.log('Run 2a-add-sponsored-trustline.js first');
            return;
        }

        // Load distributor account
        const distributorAccount = await server.loadAccount(distributorKeypair.publicKey());

        // Simple payment transaction
        const transaction = new TransactionBuilder(distributorAccount, {
            fee: BASE_FEE,
            networkPassphrase,
        })
            .addOperation(Operation.payment({
                destination: sponsoredPublic,
                asset: rahatAsset,
                amount: amount.toString(),
            }))
            .setTimeout(100)
            .build();

        // Only distributor signs
        transaction.sign(distributorKeypair);

        console.log('📤 Submitting transaction...');
        const result = await server.submitTransaction(transaction);

        console.log('\n✅ RAHAT sent successfully!');
        console.log('=====================================');
        console.log('From:', distributorKeypair.publicKey());
        console.log('To (Sponsored):', sponsoredPublic);
        console.log('Amount:', amount, process.env.ASSET_CODE);
        console.log('Transaction Hash:', result.hash);
        console.log('=====================================');

        // Verify balance
        console.log('\n🔍 Verifying balance...');
        const updatedAccount = await server.loadAccount(sponsoredPublic);
        const rahatBalance = updatedAccount.balances.find(
            b => b.asset_code === process.env.ASSET_CODE
        );
        console.log('RAHAT Balance:', rahatBalance?.balance || '0');
        const xlmBalance = updatedAccount.balances.find(b => b.asset_type === 'native');
        console.log('XLM Balance:', xlmBalance?.balance || '0');

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
    sendToSponsored();
}

module.exports = { sendToSponsored };

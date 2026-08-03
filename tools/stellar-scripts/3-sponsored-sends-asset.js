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

async function sponsoredSendsRahat() {
    try {
        // Sponsored account (sender, has 0 XLM but sponsor pays fees)
        const sponsoredSecret = await new Promise(resolve => {
            rl.question('Enter sponsored account secret key: ', resolve);
        });
        const sponsoredKeypair = Keypair.fromSecret(sponsoredSecret);
        console.log('\n📤 Sender (Sponsored):', sponsoredKeypair.publicKey());

        // RAHAT asset
        const rahatAsset = new Asset(process.env.ASSET_CODE, process.env.ISSUER_PUBLIC);
        console.log('🪙 Asset:', process.env.ASSET_CODE);

        // Get recipient
        const recipientPublic = await new Promise(resolve => {
            rl.question('Enter recipient public key: ', resolve);
        });
        console.log('🎯 Recipient:', recipientPublic);

        // Get amount
        const amount = await new Promise(resolve => {
            rl.question('Enter RAHAT amount to send: ', resolve);
        });

        // Get sponsor for fee
        const feeSponsorSecret = await new Promise(resolve => {
            rl.question('Enter fee sponsor secret key (distributor): ', resolve);
        });
        const feeSponsorKeypair = Keypair.fromSecret(feeSponsorSecret);
        console.log('💰 Fee Sponsor:', feeSponsorKeypair.publicKey());

        console.log('\n📝 Building transaction with sponsored fee...');

        // Check if recipient has trustline
        try {
            const recipientAccount = await server.loadAccount(recipientPublic);
            const hasTrustline = recipientAccount.balances.some(
                b => b.asset_code === process.env.ASSET_CODE && b.asset_issuer === process.env.ISSUER_PUBLIC
            );
            if (!hasTrustline) {
                console.log('\n⚠️  Recipient does not have RAHAT trustline!');
                const shouldContinue = await new Promise(resolve => {
                    rl.question('Continue anyway? (yes/no): ', resolve);
                });
                if (shouldContinue.toLowerCase() !== 'yes') {
                    console.log('Aborted.');
                    return;
                }
            }
        } catch (error) {
            console.log('\n⚠️  Cannot load recipient account. May not exist.');
        }

        // Load fee sponsor account
        const feeSponsorAccount = await server.loadAccount(feeSponsorKeypair.publicKey());

        // Build transaction with fee sponsor
        const transaction = new TransactionBuilder(feeSponsorAccount, {
            fee: BASE_FEE,
            networkPassphrase,
        })
            // Begin sponsoring future reserves (for fee)
            .addOperation(Operation.beginSponsoringFutureReserves({
                sponsoredId: sponsoredKeypair.publicKey(),
            }))
            // Payment from sponsored account
            .addOperation(Operation.payment({
                source: sponsoredKeypair.publicKey(),
                destination: recipientPublic,
                asset: rahatAsset,
                amount: amount.toString(),
            }))
            // End sponsoring
            .addOperation(Operation.endSponsoringFutureReserves({
                source: sponsoredKeypair.publicKey(),
            }))
            .setTimeout(100)
            .build();

        // Both accounts sign
        transaction.sign(feeSponsorKeypair); // Fee sponsor
        transaction.sign(sponsoredKeypair); // Sender

        console.log('📤 Submitting transaction...');
        const result = await server.submitTransaction(transaction);

        console.log('\n✅ Payment sent successfully from sponsored account!');
        console.log('=====================================');
        console.log('From (Sponsored):', sponsoredKeypair.publicKey());
        console.log('To:', recipientPublic);
        console.log('Amount:', amount, process.env.ASSET_CODE);
        console.log('Fee Paid By:', feeSponsorKeypair.publicKey());
        console.log('Transaction Hash:', result.hash);
        console.log('=====================================');

        // Verify sender balance
        console.log('\n🔍 Verifying sender balance...');
        const sponsoredAccount = await server.loadAccount(sponsoredKeypair.publicKey());
        const rahatBalance = sponsoredAccount.balances.find(
            b => b.asset_code === process.env.ASSET_CODE
        );
        console.log('Remaining RAHAT Balance:', rahatBalance?.balance || '0');
        const xlmBalance = sponsoredAccount.balances.find(b => b.asset_type === 'native');
        console.log('XLM Balance:', xlmBalance?.balance || '0', '(still 0 - fees sponsored!)');

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
    sponsoredSendsRahat();
}

module.exports = { sponsoredSendsRahat };

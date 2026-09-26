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

const readline = require('readline');

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, answer => {
        rl.close();
        resolve(answer.trim());
    }));
}

async function revokeSponsorshipAndTrustline() {
    try {
        const sponsorSecret = process.env.SPONSOR_SECRET || await askQuestion('Enter Sponsor Secret: ');
        const beneficiarySecret = process.env.BENEFICIARY_SECRET || await askQuestion('Enter Beneficiary Secret: ');
        const networkInput = process.env.NETWORK || await askQuestion('Enter Network (TESTNET/MAINNET) [default: TESTNET]: ') || 'TESTNET';
        const assetCodeInput = process.env.ASSET_CODE || await askQuestion('Enter Asset Code: ');

        const NETWORK = networkInput.toUpperCase();
        const serverUrl = NETWORK === 'MAINNET' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
        const networkPassphrase = NETWORK === 'MAINNET' ? Networks.PUBLIC : Networks.TESTNET;

        console.log('\nNetwork:', NETWORK);
        console.log('Server:', serverUrl);

        const server = new Horizon.Server(serverUrl);

        // Sponsor (has funds)
        const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
        console.log('\n💰 Sponsor:', sponsorKeypair.publicKey());

        // Beneficiary (the account to be unsponsored)
        const beneficiaryKeypair = Keypair.fromSecret(beneficiarySecret);
        console.log('🎯 Beneficiary:', beneficiaryKeypair.publicKey());

        // Asset: issued by the sponsor
        const assetCode = assetCodeInput;
        const sponsorPublicKey = sponsorKeypair.publicKey();
        const asset = new Asset(assetCode, sponsorPublicKey);
        console.log('🪙 Asset:', assetCode, 'issued by', sponsorPublicKey);

        // Load sponsor account (for sequence number)
        const sponsorAccount = await server.loadAccount(sponsorKeypair.publicKey());
        // Load beneficiary account (for sequence number)
        const beneficiaryAccount = await server.loadAccount(beneficiaryKeypair.publicKey());

        console.log('\n📝 Step 1: Revoke account sponsorship (sponsor signs)...');

        // Build transaction: revoke account sponsorship
        const revokeSponsorshipTx = new TransactionBuilder(sponsorAccount, {
            fee: BASE_FEE,
            networkPassphrase,
        })
            .addOperation(Operation.revokeAccountSponsorship({
                account: beneficiaryKeypair.publicKey(),
            }))
            .setTimeout(100)
            .build();

        // Sponsor signs
        revokeSponsorshipTx.sign(sponsorKeypair);

        console.log('📤 Submitting revoke sponsorship transaction...');
        const revokeResult = await server.submitTransaction(revokeSponsorshipTx);
        console.log('✅ Account sponsorship revoked!');
        console.log('Transaction Hash:', revokeResult.hash);

        // Wait a bit for the network to propagate (optional)
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('\n📝 Step 2: Remove trustline (beneficiary signs)...');

        // Build transaction: change trust to set limit to 0 (remove trustline)
        const changeTrustTx = new TransactionBuilder(beneficiaryAccount, {
            fee: BASE_FEE,
            networkPassphrase,
        })
            .addOperation(Operation.changeTrust({
                asset: asset,
                limit: '0', // Setting limit to 0 removes the trustline
            }))
            .setTimeout(100)
            .build();

        // Beneficiary signs
        changeTrustTx.sign(beneficiaryKeypair);

        console.log('📤 Submitting change trust transaction...');
        const trustResult = await server.submitTransaction(changeTrustTx);
        console.log('✅ Trustline removed!');
        console.log('Transaction Hash:', trustResult.hash);

        // Verify: check that the beneficiary account no longer has the trustline and is not sponsored
        console.log('\n🔍 Verifying...');
        const updatedBeneficiaryAccount = await server.loadAccount(beneficiaryKeypair.publicKey());
        console.log('Beneficiary Balances:', updatedBeneficiaryAccount.balances);
        console.log('Num Sponsored:', updatedBeneficiaryAccount.num_sponsored);

        const hasTrustline = updatedBeneficiaryAccount.balances.some(
            b => b.asset_code === assetCode
        );
        console.log('Trustline for', assetCode, ':', hasTrustline ? '❌ Still Present' : '✅ Removed');

        const isSponsored = updatedBeneficiaryAccount.num_sponsored > 0;
        console.log('Account Sponsored:', isSponsored ? '❌ Still Sponsored' : '✅ Not Sponsored');

    } catch (error) {
        console.error('\n❌ Error:', error.response?.data || error.message);
        if (error.response?.data?.extras?.result_codes) {
            console.log('Result codes:', error.response.data.extras.result_codes);
        }
    }
}

if (require.main === module) {
    revokeSponsorshipAndTrustline();
}

module.exports = { revokeSponsorshipAndTrustline };
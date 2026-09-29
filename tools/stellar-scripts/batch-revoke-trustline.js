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

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, answer => {
        resolve(answer.trim());
    }));
}

async function batchRevokeTrustline() {
    try {
        console.log('\n=== Batch Remove Trustline ===\n');

        // Get inputs
        let horizonUrl = process.env.HORIZON_URL || await askQuestion('Enter Horizon URL: ');
        if (!horizonUrl) {
            horizonUrl = 'https://horizon-testnet.stellar.org'; // default
        }

        let networkInput = process.env.NETWORK || await askQuestion('Enter Network (TESTNET/MAINNET) [default: TESTNET]: ');
        if (!networkInput) {
            networkInput = 'TESTNET';
        }
        const NETWORK = networkInput.toUpperCase();

        const serverUrl = horizonUrl;
        const networkPassphrase = NETWORK === 'MAINNET' ? Networks.PUBLIC : Networks.TESTNET;

        console.log('\nNetwork:', NETWORK);
        console.log('Horizon URL:', serverUrl);

        const server = new Horizon.Server(serverUrl);

        // Get sponsor secret
        const sponsorSecret = process.env.SPONSOR_SECRET || await askQuestion('Enter Sponsor Secret Key: ');
        const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
        console.log('\n💰 Sponsor:', sponsorKeypair.publicKey());

        // Get CSV file path
        const csvFilePath = process.env.CSV_FILE || await askQuestion('Enter CSV File Path (in same folder): ');
        const fullPath = path.join(__dirname, csvFilePath);

        // Check if file exists
        if (!fs.existsSync(fullPath)) {
            throw new Error(`CSV file not found: ${fullPath}`);
        }

        // Read CSV file
        const csvData = fs.readFileSync(fullPath, 'utf8');
        let lines = csvData.trim().split('\n').filter(line => line.trim() !== '');

        // Skip header line if present
        const firstLine = lines[0].toLowerCase();
        if (firstLine.includes('public') || firstLine.includes('secret') || firstLine.includes('key')) {
            lines = lines.slice(1);
            console.log('📄 Skipping header line');
        }

        console.log(`\n📄 Loaded ${lines.length} beneficiaries from CSV`);

        // Get asset code (ask once)
        let assetCode = process.env.ASSET_CODE || await askQuestion('Enter Asset Code to remove trustline for: ');
        if (!assetCode) {
            throw new Error('Asset code is required');
        }

        // Get asset issuer (may be different from sponsor)
        let assetIssuer = process.env.ASSET_ISSUER || await askQuestion('Enter Asset Issuer Public Key (may differ from sponsor): ');
        if (!assetIssuer) {
            // Default to sponsor if not provided
            assetIssuer = sponsorKeypair.publicKey();
            console.log('Using sponsor as asset issuer:', assetIssuer);
        }

        // Ask if sponsor should pay for trustline removal
        let sponsorPays = process.env.SPONSOR_PAYS === 'true';
        if (process.env.SPONSOR_PAYS === undefined) {
            const answer = await askQuestion('Should sponsor pay for trustline removal? (y/N): ');
            sponsorPays = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
        }

        // Process each beneficiary
        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const [beneficiaryPublicKey, beneficiarySecret] = line.split(',').map(field => field.trim());

            if (!beneficiaryPublicKey || !beneficiarySecret) {
                console.log(`\n⚠️  Skipping invalid line ${i + 1}: ${line}`);
                failureCount++;
                continue;
            }

            console.log(`\n--- Processing Beneficiary ${i + 1}/${lines.length} ---`);
            console.log('Public Key:', beneficiaryPublicKey);

            try {
                // Validate keys
                const beneficiaryKeypair = Keypair.fromSecret(beneficiarySecret);
                if (beneficiaryKeypair.publicKey() !== beneficiaryPublicKey) {
                    throw new Error('Public key does not match secret key');
                }

                // Load accounts
                console.log('📥 Loading accounts...');
                const sponsorAccount = await server.loadAccount(sponsorKeypair.publicKey());
                let beneficiaryAccount;
                try {
                    beneficiaryAccount = await server.loadAccount(beneficiaryKeypair.publicKey());
                } catch (err) {
                    if (err.response?.status === 404 || err.message?.includes('not found')) {
                        console.log('⚠️  Beneficiary account does not exist - skipping');
                        failureCount++;
                        continue;
                    }
                    throw err;
                }

                // Find trustline by asset code (issuer may differ from user input)
                const trustline = beneficiaryAccount.balances.find(
                    b => b.asset_code === assetCode
                );

                let actualIssuer = null;
                let asset = null;
                let balance = 0;

                if (trustline) {
                    // Use actual issuer from trustline
                    actualIssuer = trustline.asset_issuer;
                    asset = new Asset(assetCode, actualIssuer);
                    console.log('🪙 Asset:', assetCode, 'issued by', actualIssuer);

                    // Debug: Show all trustlines
                    console.log('🔍 All beneficiary balances:');
                    beneficiaryAccount.balances.forEach(b => {
                        console.log(`  - ${b.asset_type}: ${b.asset_code || 'native'} ${b.asset_issuer ? '(' + b.asset_issuer + ')' : ''} balance: ${b.balance} limit: ${b.limit}`);
                    });

                    balance = parseFloat(trustline.balance) || 0;
                    console.log(`💰 Asset balance: ${balance} ${assetCode}`);
                    console.log(`   Trustline limit: ${trustline.limit}`);

                    // Step 0: Send remaining balance back to asset issuer (if any)
                    if (balance > 0) {
                        console.log('\n📝 Step 0: Sending remaining balance to asset issuer...');
                        let sendResult;
                        if (sponsorPays) {
                            const sendTx = new TransactionBuilder(sponsorAccount, {
                                fee: BASE_FEE,
                                networkPassphrase,
                            })
                                .addOperation(Operation.payment({
                                    destination: actualIssuer,
                                    asset: asset,
                                    amount: balance.toString(),
                                    source: beneficiaryKeypair.publicKey(),
                                }))
                                .setTimeout(100)
                                .build();
                            sendTx.sign(sponsorKeypair);
                            sendTx.sign(beneficiaryKeypair);
                            console.log('📤 Submitting payment (sponsor pays)...');
                            sendResult = await server.submitTransaction(sendTx);
                        } else {
                            const sendTx = new TransactionBuilder(beneficiaryAccount, {
                                fee: BASE_FEE,
                                networkPassphrase,
                            })
                                .addOperation(Operation.payment({
                                    destination: actualIssuer,
                                    asset: asset,
                                    amount: balance.toString(),
                                }))
                                .setTimeout(100)
                                .build();
                            sendTx.sign(beneficiaryKeypair);
                            console.log('📤 Submitting payment (beneficiary pays)...');
                            sendResult = await server.submitTransaction(sendTx);
                        }
                        console.log('✅ Balance sent to asset issuer!');
                        console.log('Transaction Hash:', sendResult.hash);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                    // Step 1: Remove trustline (frees up reserve)
                    console.log('\n📝 Step 1: Remove trustline...');
                    let trustResult;
                    if (sponsorPays) {
                        console.log('💰 Sponsor paying for trustline removal...');
                        const changeTrustTx = new TransactionBuilder(sponsorAccount, {
                            fee: BASE_FEE,
                            networkPassphrase,
                        })
                            .addOperation(Operation.changeTrust({
                                asset: asset,
                                limit: '0',
                                source: beneficiaryKeypair.publicKey(),
                            }))
                            .setTimeout(100)
                            .build();

                        changeTrustTx.sign(sponsorKeypair);
                        changeTrustTx.sign(beneficiaryKeypair);

                        console.log('📤 Submitting change trust transaction (sponsor pays)...');
                        trustResult = await server.submitTransaction(changeTrustTx);
                    } else {
                        const changeTrustTx = new TransactionBuilder(beneficiaryAccount, {
                            fee: BASE_FEE,
                            networkPassphrase,
                        })
                            .addOperation(Operation.changeTrust({
                                asset: asset,
                                limit: '0',
                            }))
                            .setTimeout(100)
                            .build();

                        changeTrustTx.sign(beneficiaryKeypair);

                        console.log('📤 Submitting change trust transaction (beneficiary pays)...');
                        trustResult = await server.submitTransaction(changeTrustTx);
                    }

                    console.log('✅ Trustline removed!');
                    console.log('Transaction Hash:', trustResult.hash);

                    // Small delay
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    console.log(`⚠️  No trustline found for asset code: ${assetCode}`);
                    console.log('   Skipping trustline removal (already removed or never existed)');
                }

                // NEW: Remove ALL remaining trustlines before account merge
                // Reload account to get fresh state after trustline removal
                console.log('\n📝 Step 1b: Checking for other trustlines...');
                const freshBeneficiaryAccount = await server.loadAccount(beneficiaryKeypair.publicKey());
                const allTrustlines = freshBeneficiaryAccount.balances.filter(
                    b => b.asset_type !== 'native'
                );
                
                if (allTrustlines.length > 0) {
                    console.log(`   Found ${allTrustlines.length} additional trustline(s):`);
                    allTrustlines.forEach(tl => {
                        console.log(`   - ${tl.asset_code} (${tl.asset_issuer}) balance: ${tl.balance} limit: ${tl.limit}`);
                    });

                    // Step 1c: Send balances for any remaining assets
                    for (const tl of allTrustlines) {
                        const tlBalance = parseFloat(tl.balance) || 0;
                        if (tlBalance > 0) {
                            const tlAsset = new Asset(tl.asset_code, tl.asset_issuer);
                            console.log(`\n📝 Sending ${tlBalance} ${tl.asset_code} to issuer...`);
                            let sendResult;
                            if (sponsorPays) {
                                const sendTx = new TransactionBuilder(sponsorAccount, {
                                    fee: BASE_FEE,
                                    networkPassphrase,
                                })
                                    .addOperation(Operation.payment({
                                        destination: tl.asset_issuer,
                                        asset: tlAsset,
                                        amount: tlBalance.toString(),
                                        source: beneficiaryKeypair.publicKey(),
                                    }))
                                    .setTimeout(100)
                                    .build();
                                sendTx.sign(sponsorKeypair);
                                sendTx.sign(beneficiaryKeypair);
                                sendResult = await server.submitTransaction(sendTx);
                            } else {
                                const sendTx = new TransactionBuilder(beneficiaryAccount, {
                                    fee: BASE_FEE,
                                    networkPassphrase,
                                })
                                    .addOperation(Operation.payment({
                                        destination: tl.asset_issuer,
                                        asset: tlAsset,
                                        amount: tlBalance.toString(),
                                    }))
                                    .setTimeout(100)
                                    .build();
                                sendTx.sign(beneficiaryKeypair);
                                sendResult = await server.submitTransaction(sendTx);
                            }
                            console.log('✅ Balance sent!');
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }

                    // Step 1d: Remove all remaining trustlines
                    console.log('\n📝 Removing all remaining trustlines...');
                    for (const tl of allTrustlines) {
                        const tlAsset = new Asset(tl.asset_code, tl.asset_issuer);
                        console.log(`   Removing trustline for ${tl.asset_code}...`);
                        let removeResult;
                        if (sponsorPays) {
                            const removeTx = new TransactionBuilder(sponsorAccount, {
                                fee: BASE_FEE,
                                networkPassphrase,
                            })
                                .addOperation(Operation.changeTrust({
                                    asset: tlAsset,
                                    limit: '0',
                                    source: beneficiaryKeypair.publicKey(),
                                }))
                                .setTimeout(100)
                                .build();
                            removeTx.sign(sponsorKeypair);
                            removeTx.sign(beneficiaryKeypair);
                            removeResult = await server.submitTransaction(removeTx);
                        } else {
                            const removeTx = new TransactionBuilder(beneficiaryAccount, {
                                fee: BASE_FEE,
                                networkPassphrase,
                            })
                                .addOperation(Operation.changeTrust({
                                    asset: tlAsset,
                                    limit: '0',
                                }))
                                .setTimeout(100)
                                .build();
                            removeTx.sign(beneficiaryKeypair);
                            removeResult = await server.submitTransaction(removeTx);
                        }
                        console.log(`   ✅ ${tl.asset_code} trustline removed!`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } else {
                    console.log('   No other trustlines found.');
                }

                // Step 2: Account merge - close account entirely, send all XLM to sponsor
                // Runs for ALL existing accounts (regardless of trustline)
                console.log('\n📝 Step 2: Account merge (close account, send XLM to sponsor)...');
                // Reload sponsor account for fresh sequence number
                const freshSponsorAccount = await server.loadAccount(sponsorKeypair.publicKey());
                
                const mergeTx = new TransactionBuilder(freshSponsorAccount, {
                    fee: BASE_FEE,
                    networkPassphrase,
                })
                    .addOperation(Operation.accountMerge({
                        destination: sponsorKeypair.publicKey(),
                        source: beneficiaryKeypair.publicKey(),
                    }))
                    .setTimeout(100)
                    .build();

                // Sponsor pays fee, beneficiary authorizes account closure
                mergeTx.sign(sponsorKeypair);
                mergeTx.sign(beneficiaryKeypair);

                console.log('📤 Submitting account merge transaction...');
                const mergeResult = await server.submitTransaction(mergeTx);
                console.log('✅ Account closed! All XLM sent to sponsor.');
                console.log('Transaction Hash:', mergeResult.hash);

                successCount++;

                // Verify (optional)
                console.log('\n🔍 Verifying...');
                const updatedBeneficiaryAccount = await server.loadAccount(beneficiaryKeypair.publicKey());
                const hasTrustline = updatedBeneficiaryAccount.balances.some(
                    b => b.asset_code === assetCode
                );
                console.log('Trustline for', assetCode, ':', hasTrustline ? '❌ Still Present' : '✅ Removed');
                const isSponsored = updatedBeneficiaryAccount.num_sponsored > 0;
                console.log('Account Sponsored:', isSponsored ? '❌ Still Sponsored' : '✅ Not Sponsored');

        } catch (error) {
                console.error(`\n❌ Error processing beneficiary ${beneficiaryPublicKey}:`, error.response?.data?.extras?.result_codes || error.message);
                failureCount++;
            }

            // Delay between beneficiaries to avoid rate limits
            if (i < lines.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }

        console.log('\n=== Batch Processing Complete ===');
        console.log('✅ Successful:', successCount);
        console.log('❌ Failed:', failureCount);
        console.log('📊 Total Processed:', lines.length);

    } catch (error) {
        console.error('\n❌ Fatal Error:', error.response?.data || error.message);
    } finally {
        rl.close();
    }
}

if (require.main === module) {
    batchRevokeTrustline();
}

module.exports = { batchRevokeTrustline };
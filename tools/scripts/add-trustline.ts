import {
  Asset,
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Keypair,
} from '@stellar/stellar-sdk';
import axios from 'axios';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

// Constants for the asset (e.g., USDC on testnet)
const ASSET_CODE = 'USDC';
const ASSET_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'; // Testnet USDC issuer

// Function to add trustline
export const add_trustline = async (
  publicKey: string,
  secretKey: string,
  ASSET_Issuer: string,
  ASSET_code: string
) => {
  try {
    const usdcAsset = new Asset(ASSET_code, ASSET_Issuer);
    const server = new Horizon.Server('https://soroban-testnet.stellar.org');
    const account = await server.loadAccount(publicKey);

    const transaction = new TransactionBuilder(account, {
      fee: (await server.fetchBaseFee()).toString(),
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.changeTrust({
          asset: usdcAsset,
        })
      )
      .setTimeout(100)
      .build();

    transaction.sign(Keypair.fromSecret(secretKey));

    await server.submitTransaction(transaction);
    console.log('Added trustline successfully.');
  } catch (error) {
    console.error(`Failed to add trustline: ${error.message}`);
    throw error;
  }
};

// CLI function to handle secret key input and trustline addition
const main = async () => {
  const rl = readline.createInterface({ input, output });

  try {
    // Prompt for secret key
    const secretKey = await rl.question('Enter your Stellar secret key: ');

    // Derive public key from secret key
    const keypair = Keypair.fromSecret(secretKey);
    const publicKey = keypair.publicKey();

    // Fund account using Friendbot
    const friendbotUrl = `https://friendbot.stellar.org?addr=${publicKey}`;
    await axios.get(friendbotUrl);
    console.log(`Account ${publicKey} funded via Friendbot.`);

    // Add trustline for USDC
    await add_trustline(publicKey, secretKey, ASSET_ISSUER, ASSET_CODE);

    console.log('Trustline for USDC added successfully.');
  } catch (error) {
    console.error(`Error: ${error.message}`);
  } finally {
    rl.close();
  }
};

// Run the script
main();

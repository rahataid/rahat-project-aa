import {
  Asset,
  Horizon,
  Networks,
  Operation,
  TransactionBuilder,
  Keypair,
} from '@stellar/stellar-sdk';

export async function transferAsset(
  destinationAddress: string,
  asset: Asset,
  amount: string,
  assetSecret: string,
  horizonServer: string,
  network: string
): Promise<void> {
  try {
    const server = new Horizon.Server(horizonServer);
    const sourceKeypair = Keypair.fromSecret(assetSecret);
    const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

    const transaction = new TransactionBuilder(sourceAccount, {
      fee: (await server.fetchBaseFee()).toString(),
      networkPassphrase:
        network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: destinationAddress,
          asset,
          amount,
        })
      )
      .setTimeout(30)
      .build();

    transaction.sign(sourceKeypair);
    await server.submitTransaction(transaction);
  } catch (error: any) {
    throw new Error(`Asset transfer failed: ${error.message}`);
  }
}

export async function addTrustline(
  publicKey: string,
  secretKey: string,
  assetIssuer: string,
  assetCode: string,
  horizonServer: string,
  network: string
): Promise<void> {
  try {
    if (!assetCode || !assetIssuer) {
      throw new Error('Asset code or issuer not found');
    }
    if (!publicKey || !secretKey) {
      throw new Error('Public key or secret key not found');
    }
    const rahatAsset = new Asset(assetCode, assetIssuer);
    const server = new Horizon.Server(horizonServer);
    const account = await server.loadAccount(publicKey);
    const transaction = new TransactionBuilder(account, {
      fee: (await server.fetchBaseFee()).toString(),
      networkPassphrase:
        network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET,
    })
      .addOperation(
        Operation.changeTrust({
          asset: rahatAsset,
        })
      )
      .setTimeout(100)
      .build();
    transaction.sign(
      require('@stellar/stellar-sdk').Keypair.fromSecret(secretKey)
    );
    await server.submitTransaction(transaction);
  } catch (error: any) {
    throw new Error(`Error adding trustline: ${error.message}`);
  }
}

import { Asset, BASE_FEE, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { PaymentOpContext, PaymentResult, SendPaymentContext, StellarOperationError } from '../types';
import { describePaymentError } from '../utils/errors';
import { submitTransaction } from './submit';

/**
 * Sponsor sends the configured asset to a (sponsored) account. Only the
 * sponsor signs - the destination account does not need to be involved.
 */
export async function sendToSponsored(
  ctx: PaymentOpContext,
  destinationPublicKey: string,
  amount: string
): Promise<PaymentResult> {
  const sponsorAccount = await ctx.server.loadAccount(ctx.sponsorKeypair.publicKey());

  const tx = new TransactionBuilder(sponsorAccount, {
    fee: BASE_FEE,
    networkPassphrase: ctx.networkPassphrase,
  })
    .addOperation(Operation.payment({ destination: destinationPublicKey, asset: ctx.asset, amount }))
    .setTimeout(100)
    .build();

  tx.sign(ctx.sponsorKeypair);

  const result = await submitTransaction(ctx.server, tx);

  return { hash: result.hash, successful: result.successful, ledger: result.ledger };
}

const SEND_FROM_SPONSORED_OPS = 3;

/**
 * A sponsored account (0 XLM balance) sends the configured asset onward.
 * The sponsor is the transaction source and pays the fee via
 * begin/endSponsoringFutureReserves around the payment operation. Both the
 * sponsor and the sponsored account must sign.
 */
export async function sendFromSponsored(
  ctx: PaymentOpContext,
  sponsoredSecret: string,
  destinationPublicKey: string,
  amount: string
): Promise<PaymentResult> {
  const sponsoredKeypair = Keypair.fromSecret(sponsoredSecret);
  const sponsorAccount = await ctx.server.loadAccount(ctx.sponsorKeypair.publicKey());

  const tx = new TransactionBuilder(sponsorAccount, {
    fee: (Number(BASE_FEE) * SEND_FROM_SPONSORED_OPS).toString(),
    networkPassphrase: ctx.networkPassphrase,
  })
    .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: sponsoredKeypair.publicKey() }))
    .addOperation(
      Operation.payment({
        source: sponsoredKeypair.publicKey(),
        destination: destinationPublicKey,
        asset: ctx.asset,
        amount,
      })
    )
    .addOperation(Operation.endSponsoringFutureReserves({ source: sponsoredKeypair.publicKey() }))
    .setTimeout(100)
    .build();

  tx.sign(ctx.sponsorKeypair);
  tx.sign(sponsoredKeypair);

  const result = await submitTransaction(ctx.server, tx);

  return { hash: result.hash, successful: result.successful, ledger: result.ledger };
}

/**
 * A plain, non-sponsored send: the sender account pays its own fee and is
 * the sole signer. Works for any asset, including native XLM via
 * Asset.native(). Use this when no sponsor relationship is involved.
 */
export async function sendPayment(
  ctx: SendPaymentContext,
  senderSecret: string,
  destinationPublicKey: string,
  asset: Asset,
  amount: string
): Promise<PaymentResult> {
  const senderKeypair = Keypair.fromSecret(senderSecret);

  let senderAccount;
  try {
    senderAccount = await ctx.server.loadAccount(senderKeypair.publicKey());
  } catch (error) {
    if ((error as { response?: { status?: number } })?.response?.status === 404) {
      throw new StellarOperationError(
        `Sender account ${senderKeypair.publicKey()} does not exist or is not funded on the network.`,
        { cause: error }
      );
    }
    throw error;
  }

  const tx = new TransactionBuilder(senderAccount, {
    fee: BASE_FEE,
    networkPassphrase: ctx.networkPassphrase,
  })
    .addOperation(Operation.payment({ destination: destinationPublicKey, asset, amount }))
    .setTimeout(100)
    .build();

  tx.sign(senderKeypair);

  try {
    const result = await submitTransaction(ctx.server, tx);
    return { hash: result.hash, successful: result.successful, ledger: result.ledger };
  } catch (error) {
    throw describePaymentError(error, asset);
  }
}

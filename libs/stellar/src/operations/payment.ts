import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { PaymentResult, StellarOperationError } from '../types';
import { submitTransaction } from './submit';

export interface PaymentOpContext {
  server: Horizon.Server;
  networkPassphrase: string;
  sponsorKeypair: Keypair;
  asset: Asset;
}

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

export interface SendPaymentContext {
  server: Horizon.Server;
  networkPassphrase: string;
}

function describeAsset(asset: Asset): string {
  return asset.isNative() ? 'XLM' : `${asset.getCode()}:${asset.getIssuer()}`;
}

const PAYMENT_ERROR_MESSAGES: Record<string, (assetDescription: string) => string> = {
  op_no_trust: (asset) =>
    `Destination account does not have a trustline for ${asset}. The receiver must establish a trustline for this asset before they can receive it.`,
  op_no_destination: () =>
    `Destination account does not exist on the network. It must be created and funded with a minimum XLM balance before it can receive payments.`,
  op_src_no_trust: (asset) => `Sender account does not have a trustline for ${asset}.`,
  op_underfunded: (asset) => `Sender account does not have enough ${asset} to complete this payment.`,
  op_not_authorized: (asset) => `Destination account is not authorized to hold ${asset} (the issuer has not approved it).`,
  op_src_not_authorized: (asset) => `Sender account is not authorized to send ${asset}.`,
  op_line_full: (asset) => `Destination account's trustline for ${asset} is full and cannot accept this amount.`,
  op_no_issuer: (asset) => `The issuer account for ${asset} does not exist.`,
};

/**
 * Rewrites a StellarOperationError from submitTransaction into a
 * human-readable message when the Horizon result code identifies a known
 * payment failure (e.g. a missing trustline), while preserving the original
 * resultCodes/raw/cause for callers that want to inspect them. Falls through
 * unchanged for unrecognized errors.
 */
function describePaymentError(error: unknown, asset: Asset): unknown {
  if (error instanceof StellarOperationError) {
    const code = (error.resultCodes as { operations?: string[] } | undefined)?.operations?.find(
      (c) => c in PAYMENT_ERROR_MESSAGES
    );
    if (code) {
      return new StellarOperationError(PAYMENT_ERROR_MESSAGES[code](describeAsset(asset)), {
        resultCodes: error.resultCodes,
        raw: error.raw,
        cause: error,
      });
    }
  }
  return error;
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

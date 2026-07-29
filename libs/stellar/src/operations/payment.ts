import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import {
  PaymentOpContext,
  PaymentResult,
  SendBatchPaymentResult,
  SendFromSponsoredBatchResult,
  SendPaymentContext,
  SponsoredBatchTransferItem,
  StellarOperationError,
} from '../types';
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
 * Stellar caps a transaction at 100 operations and 20 signatures. A batched
 * payment needs 1 operation and 1 signature per beneficiary (no reserve is
 * touched by moving an already-held balance, so unlike sendFromSponsored no
 * begin/endSponsoringFutureReserves wrapper is needed here), plus the
 * sponsor's signature - so signatures are the binding constraint well before
 * operations are. 12 keeps a wide margin under that cap.
 */
export const MAX_TRANSFERS_PER_BATCH = 12;

/**
 * Combines up to MAX_TRANSFERS_PER_BATCH sponsored-account payments into a
 * single sponsor-signed transaction, consuming exactly one sponsor sequence
 * number for the whole batch. Each beneficiary still signs their own payment
 * operation. All returned items share the one transaction hash.
 */
export async function sendFromSponsoredBatch(
  ctx: PaymentOpContext,
  items: SponsoredBatchTransferItem[]
): Promise<SendFromSponsoredBatchResult> {
  if (items.length < 1 || items.length > MAX_TRANSFERS_PER_BATCH) {
    throw new RangeError(`items.length must be between 1 and ${MAX_TRANSFERS_PER_BATCH} (got ${items.length})`);
  }

  const keypairs = items.map((item) => Keypair.fromSecret(item.secret));
  const sponsorAccount = await ctx.server.loadAccount(ctx.sponsorKeypair.publicKey());

  // TransactionBuilder's `fee` is the max fee per operation - it multiplies
  // this by the operation count itself, so pass BASE_FEE unscaled.
  let builder = new TransactionBuilder(sponsorAccount, {
    fee: BASE_FEE,
    networkPassphrase: ctx.networkPassphrase,
  });

  items.forEach((item, idx) => {
    builder = builder.addOperation(
      Operation.payment({
        source: keypairs[idx].publicKey(),
        destination: item.destination,
        asset: ctx.asset,
        amount: item.amount,
      })
    );
  });

  const tx = builder.setTimeout(100).build();

  tx.sign(ctx.sponsorKeypair);
  for (const kp of keypairs) {
    tx.sign(kp);
  }

  const result = await submitTransaction(ctx.server, tx);

  // Horizon operation IDs within a single transaction are assigned in
  // submission order, but we don't just trust that ordering blindly - each
  // resolved payment operation's `from` is matched against the beneficiary
  // (source) public key it's supposed to belong to, so a paymentId can never
  // be attributed to the wrong beneficiary.
  const opPage = await ctx.server.operations().forTransaction(result.hash).order('asc').limit(items.length).call();
  const paymentOps = opPage.records.filter(isPaymentOperationRecord);

  if (paymentOps.length !== items.length) {
    throw new StellarOperationError(
      `Expected ${items.length} payment operation(s) for batch transaction ${result.hash}, found ${paymentOps.length}`,
      { raw: opPage.records }
    );
  }

  const unmatchedOps = [...paymentOps];

  return {
    hash: result.hash,
    successful: result.successful,
    ledger: result.ledger,
    items: items.map((item, idx) => {
      const sourcePublicKey = keypairs[idx].publicKey();
      const opIndex = unmatchedOps.findIndex((op) => op.from === sourcePublicKey);
      if (opIndex === -1) {
        throw new StellarOperationError(
          `No payment operation found from beneficiary ${sourcePublicKey} in batch transaction ${result.hash}`,
          { raw: paymentOps }
        );
      }
      const [op] = unmatchedOps.splice(opIndex, 1);

      return {
        sourcePublicKey,
        destination: item.destination,
        amount: item.amount,
        paymentId: op.id,
      };
    }),
  };
}

function isPaymentOperationRecord(
  record: Horizon.ServerApi.OperationRecord
): record is Horizon.ServerApi.PaymentOperationRecord {
  return record.type === 'payment';
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

export async function sendBatchPayment(
  ctx: SendPaymentContext,
  asset: Asset,
  designatedWalletKeypair: Keypair,
  receivers: {
    destination: string,
    amount: string
  }[]
): Promise<SendBatchPaymentResult> {
  if (receivers.length < 1 || receivers.length > MAX_TRANSFERS_PER_BATCH) {
    throw new RangeError(`receivers.length must be between 1 and ${MAX_TRANSFERS_PER_BATCH} (got ${receivers.length})`);
  }

  const designatedAccount = await ctx.server.loadAccount(designatedWalletKeypair.publicKey());

  let builder = new TransactionBuilder(designatedAccount, {
    fee: BASE_FEE,
    networkPassphrase: ctx.networkPassphrase
  })

  receivers.forEach((receiver) => {
    builder = builder.addOperation(
      Operation.payment({
        destination: receiver.destination,
        amount: receiver.amount,
        asset: asset
      })
    )
  })

  const tx = builder.setTimeout(100).build();

  tx.sign(designatedWalletKeypair);

  const result = await submitTransaction(ctx.server, tx);

  const opPage = await ctx.server.operations().forTransaction(result.hash).order('asc').limit(receivers.length).call();
  const paymentOps = opPage.records.filter(isPaymentOperationRecord);

  if (paymentOps.length !== receivers.length) {
    throw new StellarOperationError(
      `Expected ${receivers.length} payment operation(s) for batch transaction ${result.hash}, found ${paymentOps.length}`,
      { raw: opPage.records }
    );
  }

  return {
    hash: result.hash,
    successful: result.successful,
    ledger: result.ledger,
    items: receivers.map((item, idx) => {
      const op = paymentOps[idx];
      return {
        destination: item.destination,
        amount: item.amount,
        paymentId: op.id,
      };
    }),
  };
}
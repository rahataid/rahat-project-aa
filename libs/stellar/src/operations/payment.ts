import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { PaymentResult } from '../types';
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

import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { PaymentResult } from '../types';
import { submitTransaction } from './submit';

export interface FundAccountContext {
  server: Horizon.Server;
  networkPassphrase: string;
  sponsorKeypair: Keypair;
}

/**
 * Sends `amount` XLM from the sponsor to `destination`.
 * Uses createAccount if the account doesn't exist yet, payment otherwise.
 */
export async function fundAccountWithXlm(
  ctx: FundAccountContext,
  destination: string,
  amount: string
): Promise<PaymentResult> {
  const sponsorAccount = await ctx.server.loadAccount(ctx.sponsorKeypair.publicKey());
  const exists = await ctx.server.loadAccount(destination).then(() => true).catch((e: unknown) => {
    if ((e as { response?: { status?: number } })?.response?.status === 404) return false;
    throw e;
  });

  const op = exists
    ? Operation.payment({ destination, asset: Asset.native(), amount })
    : Operation.createAccount({ destination, startingBalance: amount });

  const tx = new TransactionBuilder(sponsorAccount, { fee: BASE_FEE, networkPassphrase: ctx.networkPassphrase })
    .addOperation(op)
    .setTimeout(100)
    .build();

  tx.sign(ctx.sponsorKeypair);
  const result = await submitTransaction(ctx.server, tx);
  return { hash: result.hash, successful: result.successful, ledger: result.ledger };
}

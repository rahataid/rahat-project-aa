import { Account, Asset, BASE_FEE, Horizon, Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import { MAX_TRANSFERS_PER_BATCH, sendFromSponsoredBatch, sendPayment } from './payment';
import { PaymentOpContext, SendPaymentContext } from '../types';

describe('sendPayment', () => {
  const senderKeypair = Keypair.random();
  const destinationPublicKey = Keypair.random().publicKey();
  const asset = new Asset('RAHAT', 'GAVSXFHUI5YWS3YI2RFQV7SB3KKVFERKWWY2QSVJNDTROKQZRWEPXLWG');

  function makeCtx(server: Partial<Horizon.Server>): SendPaymentContext {
    return {
      server: server as unknown as Horizon.Server,
      networkPassphrase: Networks.TESTNET,
    };
  }

  it('sends a payment and returns the transaction result', async () => {
    const account = new Account(senderKeypair.publicKey(), '1');
    const submitTransaction = jest.fn().mockResolvedValue({ hash: 'abc123', successful: true, ledger: 42 });
    const ctx = makeCtx({
      loadAccount: jest.fn().mockResolvedValue(account),
      submitTransaction,
    });

    const result = await sendPayment(ctx, senderKeypair.secret(), destinationPublicKey, asset, '10');

    expect(result).toEqual({ hash: 'abc123', successful: true, ledger: 42 });
    expect(submitTransaction).toHaveBeenCalledTimes(1);
  });

  it('throws a descriptive error when the sender account does not exist', async () => {
    const notFound = Object.assign(new Error('Not Found'), { response: { status: 404 } });
    const ctx = makeCtx({
      loadAccount: jest.fn().mockRejectedValue(notFound),
      submitTransaction: jest.fn(),
    });

    await expect(sendPayment(ctx, senderKeypair.secret(), destinationPublicKey, asset, '10')).rejects.toMatchObject({
      name: 'StellarOperationError',
      message: expect.stringContaining('does not exist or is not funded'),
    });
  });

  it('describes a missing destination trustline instead of the raw Horizon error', async () => {
    const account = new Account(senderKeypair.publicKey(), '1');
    const horizonError = Object.assign(new Error('Bad request'), {
      response: {
        data: {
          extras: { result_codes: { transaction: 'tx_failed', operations: ['op_no_trust'] } },
        },
      },
    });
    const ctx = makeCtx({
      loadAccount: jest.fn().mockResolvedValue(account),
      submitTransaction: jest.fn().mockRejectedValue(horizonError),
    });

    await expect(sendPayment(ctx, senderKeypair.secret(), destinationPublicKey, asset, '10')).rejects.toMatchObject({
      name: 'StellarOperationError',
      message: expect.stringContaining('does not have a trustline for RAHAT:GAVSXFHUI5YWS3YI2RFQV7SB3KKVFERKWWY2QSVJNDTROKQZRWEPXLWG'),
      resultCodes: { transaction: 'tx_failed', operations: ['op_no_trust'] },
    });
  });

  it('describes a missing trustline for native XLM without an issuer', async () => {
    const account = new Account(senderKeypair.publicKey(), '1');
    const horizonError = Object.assign(new Error('Bad request'), {
      response: {
        data: {
          extras: { result_codes: { transaction: 'tx_failed', operations: ['op_no_trust'] } },
        },
      },
    });
    const ctx = makeCtx({
      loadAccount: jest.fn().mockResolvedValue(account),
      submitTransaction: jest.fn().mockRejectedValue(horizonError),
    });

    await expect(
      sendPayment(ctx, senderKeypair.secret(), destinationPublicKey, Asset.native(), '10')
    ).rejects.toMatchObject({
      message: expect.stringContaining('does not have a trustline for XLM'),
    });
  });

  it('passes through unrecognized Horizon errors unchanged', async () => {
    const account = new Account(senderKeypair.publicKey(), '1');
    const horizonError = Object.assign(new Error('Bad request'), {
      response: {
        data: {
          extras: { result_codes: { transaction: 'tx_failed', operations: ['op_bad_auth'] } },
        },
      },
    });
    const ctx = makeCtx({
      loadAccount: jest.fn().mockResolvedValue(account),
      submitTransaction: jest.fn().mockRejectedValue(horizonError),
    });

    await expect(sendPayment(ctx, senderKeypair.secret(), destinationPublicKey, asset, '10')).rejects.toMatchObject({
      name: 'StellarOperationError',
      message: expect.stringContaining('Stellar transaction submission failed'),
      resultCodes: { transaction: 'tx_failed', operations: ['op_bad_auth'] },
    });
  });
});

describe('sendFromSponsoredBatch', () => {
  const sponsorKeypair = Keypair.random();
  const asset = new Asset('RAHAT', 'GAVSXFHUI5YWS3YI2RFQV7SB3KKVFERKWWY2QSVJNDTROKQZRWEPXLWG');

  function makeCtx(server: Partial<Horizon.Server>): PaymentOpContext {
    return {
      server: server as unknown as Horizon.Server,
      networkPassphrase: Networks.TESTNET,
      sponsorKeypair,
      asset,
    };
  }

  it('rejects an empty items array', async () => {
    await expect(sendFromSponsoredBatch(makeCtx({}), [])).rejects.toThrow(RangeError);
  });

  it('rejects an items array exceeding MAX_TRANSFERS_PER_BATCH', async () => {
    const items = Array.from({ length: MAX_TRANSFERS_PER_BATCH + 1 }, () => ({
      secret: Keypair.random().secret(),
      destination: Keypair.random().publicKey(),
      amount: '1',
    }));
    await expect(sendFromSponsoredBatch(makeCtx({}), items)).rejects.toThrow(RangeError);
  });

  it('combines every item into a single sponsor-signed transaction', async () => {
    const beneficiaries = Array.from({ length: 3 }, () => Keypair.random());
    const items = beneficiaries.map((kp, idx) => ({
      secret: kp.secret(),
      destination: Keypair.random().publicKey(),
      amount: `${idx + 1}`,
    }));

    const account = new Account(sponsorKeypair.publicKey(), '1');
    let submittedTx: Transaction | undefined;
    const submitTransaction = jest.fn().mockImplementation(async (tx: Transaction) => {
      submittedTx = tx;
      return { hash: 'batch123', successful: true, ledger: 7 };
    });
    const ctx = makeCtx({
      loadAccount: jest.fn().mockResolvedValue(account),
      submitTransaction,
    });

    const result = await sendFromSponsoredBatch(ctx, items);

    expect(result.hash).toBe('batch123');
    expect(result.items).toEqual(
      beneficiaries.map((kp, idx) => ({
        sourcePublicKey: kp.publicKey(),
        destination: items[idx].destination,
        amount: items[idx].amount,
      }))
    );

    expect(submitTransaction).toHaveBeenCalledTimes(1);
    expect(submittedTx?.operations).toHaveLength(items.length);
    submittedTx?.operations.forEach((op, idx) => {
      expect(op.type).toBe('payment');
      expect(op.source).toBe(beneficiaries[idx].publicKey());
    });
    expect(submittedTx?.fee).toBe((Number(BASE_FEE) * items.length).toString());
    // (fee param is per-operation; the SDK multiplies it by operation count internally)
    // sponsor signature + one per beneficiary
    expect(submittedTx?.signatures).toHaveLength(items.length + 1);
  });
});

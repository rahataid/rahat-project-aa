import { Account, Asset, Horizon, Keypair, Networks } from '@stellar/stellar-sdk';
import { SendPaymentContext, sendPayment } from './payment';

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

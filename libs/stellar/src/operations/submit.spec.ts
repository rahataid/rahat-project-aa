import { Account, Horizon, Keypair, Networks, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { submitTransaction } from './submit';
import { StellarOperationError } from '../types';

const tx = {} as unknown as Transaction;

describe('submitTransaction', () => {
  it('wraps Horizon errors with result codes', async () => {
    const error = Object.assign(new Error('Bad request'), {
      response: {
        data: {
          extras: {
            result_codes: { transaction: 'tx_failed', operations: ['op_underfunded'] },
          },
        },
      },
    });

    const server = {
      submitTransaction: jest.fn().mockRejectedValue(error),
    } as unknown as Horizon.Server;

    await expect(submitTransaction(server, tx)).rejects.toMatchObject({
      name: 'StellarOperationError',
      resultCodes: { transaction: 'tx_failed', operations: ['op_underfunded'] },
    });
  });

  it('wraps errors without a Horizon response body', async () => {
    const server = {
      submitTransaction: jest.fn().mockRejectedValue(new Error('network down')),
    } as unknown as Horizon.Server;

    await expect(submitTransaction(server, tx)).rejects.toThrow(StellarOperationError);
  });

  describe('when Horizon times out (504, no result codes)', () => {
    const timeout = Object.assign(new Error('Request failed with status code 504'), { response: { status: 504, data: {} } });
    const notFound = Object.assign(new Error('Not Found'), { response: { status: 404 } });
    const txExpiringIn = (seconds: number) =>
      new TransactionBuilder(new Account(Keypair.random().publicKey(), '1'), { fee: '100', networkPassphrase: Networks.TESTNET })
        .addOperation(Operation.bumpSequence({ bumpTo: '2' }))
        .setTimeout(seconds)
        .build();
    /** `ingestedAt` returns the close time (unix s) of Horizon's newest ingested ledger, per poll. */
    const serverWithLookup = (call: jest.Mock, ingestedAt: () => number) =>
      ({
        submitTransaction: jest.fn().mockRejectedValue(timeout),
        transactions: () => ({ transaction: () => ({ call }) }),
        ledgers: () => ({
          order: () => ({
            limit: () => ({
              call: async () => ({ records: [{ closed_at: new Date(ingestedAt() * 1000).toISOString() }] }),
            }),
          }),
        }),
      }) as unknown as Horizon.Server;
    const now = () => Date.now() / 1000;

    afterEach(() => jest.useRealTimers());

    it('keeps polling past the timebound while Horizon lags, until the landed tx shows up', async () => {
      jest.useFakeTimers();
      const landed = { hash: 'abc', successful: true, ledger: 7 };
      // the tx landed, but Horizon only ingests it ~60s later (the 2026-10-30 testnet case)
      const call = jest.fn().mockRejectedValue(notFound);
      const tx = txExpiringIn(30);
      const result = submitTransaction(serverWithLookup(call, () => now() - 120), tx);

      await jest.advanceTimersByTimeAsync(60_000);
      call.mockResolvedValue(landed);
      await jest.advanceTimersByTimeAsync(5_000);

      await expect(result).resolves.toEqual(landed);
    });

    it('fails as soon as Horizon has ingested past the timebound without the tx', async () => {
      jest.useFakeTimers();
      const call = jest.fn().mockRejectedValue(notFound);
      const tx = txExpiringIn(30);
      // Horizon is caught up to real time
      const result = submitTransaction(serverWithLookup(call, now), tx);
      const assertion = expect(result).rejects.toThrow(StellarOperationError);

      await jest.advanceTimersByTimeAsync(60_000);

      await assertion;
      // ~30s at 5s intervals until a ledger after maxTime is ingested, then the conclusive lookup;
      // far short of the 300s cap
      expect(call.mock.calls.length).toBeGreaterThanOrEqual(6);
      expect(call.mock.calls.length).toBeLessThanOrEqual(8);
    });

    it('gives up after the cap when Horizon stays behind', async () => {
      jest.useFakeTimers();
      const call = jest.fn().mockRejectedValue(notFound);
      const result = submitTransaction(serverWithLookup(call, () => 0), txExpiringIn(30));
      const assertion = expect(result).rejects.toThrow(StellarOperationError);

      await jest.advanceTimersByTimeAsync(301_000);

      await assertion;
      // t = 0, 5, ... 300
      expect(call.mock.calls.length).toBe(61);
    });
  });

  it('returns the Horizon response on success', async () => {
    const response = { hash: 'abc123', successful: true, ledger: 42 };
    const server = {
      submitTransaction: jest.fn().mockResolvedValue(response),
    } as unknown as Horizon.Server;

    await expect(submitTransaction(server, tx)).resolves.toEqual(response);
  });
});

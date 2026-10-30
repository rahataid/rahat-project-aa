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
    const serverWithLookup = (call: jest.Mock) =>
      ({
        submitTransaction: jest.fn().mockRejectedValue(timeout),
        transactions: () => ({ transaction: () => ({ call }) }),
      }) as unknown as Horizon.Server;

    afterEach(() => jest.useRealTimers());

    it('keeps looking the hash up until Horizon has ingested the landed tx', async () => {
      jest.useFakeTimers();
      const landed = { hash: 'abc', successful: true, ledger: 7 };
      const call = jest.fn().mockRejectedValueOnce(notFound).mockRejectedValueOnce(notFound).mockResolvedValue(landed);

      const result = submitTransaction(serverWithLookup(call), txExpiringIn(100));
      await jest.advanceTimersByTimeAsync(10_000);

      await expect(result).resolves.toEqual(landed);
      expect(call).toHaveBeenCalledTimes(3);
    });

    it('throws once the timebound has passed and the tx never showed up', async () => {
      jest.useFakeTimers();
      const call = jest.fn().mockRejectedValue(notFound);

      const result = submitTransaction(serverWithLookup(call), txExpiringIn(10));
      const assertion = expect(result).rejects.toThrow(StellarOperationError);
      await jest.advanceTimersByTimeAsync(60_000);

      await assertion;
      // 10s timebound + 15s grace at 5s intervals
      expect(call.mock.calls.length).toBeGreaterThanOrEqual(5);
      expect(call.mock.calls.length).toBeLessThanOrEqual(6);
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

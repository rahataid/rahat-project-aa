import { Horizon, Transaction } from '@stellar/stellar-sdk';
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

  it('returns the Horizon response on success', async () => {
    const response = { hash: 'abc123', successful: true, ledger: 42 };
    const server = {
      submitTransaction: jest.fn().mockResolvedValue(response),
    } as unknown as Horizon.Server;

    await expect(submitTransaction(server, tx)).resolves.toEqual(response);
  });
});

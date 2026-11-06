import { Account, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { of, throwError } from 'rxjs';
import { JOBS } from '../constants';
import { StellarSponsorProcessor } from './stellar-sponsor.processor';

describe('StellarSponsorProcessor sponsor batch reserve source', () => {
  const beneficiary = Keypair.random();
  const core = Keypair.random().publicKey();
  const job = {
    id: 1,
    data: {
      type: 'SPONSOR_ACCOUNTS_BATCH',
      groupUuid: 'group-1',
      beneficiaries: [{ beneficiaryId: 'ben-1', walletAddress: beneficiary.publicKey() }],
    },
  } as any;
  const anyTx = new TransactionBuilder(new Account(Keypair.random().publicKey(), '1'), {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.bumpSequence({ bumpTo: '2' }))
    .setTimeout(30)
    .build();

  let createSponsoredAccountsBatch: jest.Mock;
  let update: jest.Mock;

  const processorWith = (coreStatus: unknown, sign: () => unknown) => {
    // Stands in for the lib: builds the tx, then asks the reserve payer (if any) to sign it.
    createSponsoredAccountsBatch = jest.fn(async (keypairs: Keypair[], reservePayer) => {
      if (reservePayer) await reservePayer.sign(anyTx);
      const accounts = keypairs.map((kp) => ({ publicKey: kp.publicKey(), secretKey: kp.secret(), action: 'create' }));
      return { hash: 'h', successful: true, accounts };
    });
    update = jest.fn().mockResolvedValue({});
    const responses: Record<string, () => unknown> = {
      [JOBS.WALLET.GET_BULK_SECRET_BY_WALLET]: () =>
        of([{ address: beneficiary.publicKey(), privateKey: beneficiary.secret() }]),
      [JOBS.WALLET.GET_CORE_SPONSOR_STATUS]: () => of(coreStatus),
      [JOBS.WALLET.SIGN_SPONSORSHIP_TX]: sign,
    };
    const client = { send: jest.fn(({ cmd }) => responses[cmd]()) };
    const prisma = {
      beneficiary: { findMany: jest.fn().mockResolvedValue([{ uuid: 'ben-1', extras: {} }]), update },
    };
    const stellarClient = { networkPassphrase: Networks.TESTNET, createSponsoredAccountsBatch };
    return new StellarSponsorProcessor(stellarClient as any, client as any, prisma as any);
  };

  it('fails the batch when the core is short, and never falls back to the project sponsor', async () => {
    const processor = processorWith(
      { publicKey: core, networkPassphrase: Networks.TESTNET, freeStroops: 0 },
      () => throwError(() => ({ message: '[INSUFFICIENT_SPONSOR_FUNDS] Not enough funds', code: 'INSUFFICIENT_SPONSOR_FUNDS' }))
    );

    await expect(processor.processSponsorQueueSerial(job)).rejects.toMatchObject({ code: 'INSUFFICIENT_SPONSOR_FUNDS' });

    expect(createSponsoredAccountsBatch).toHaveBeenCalledTimes(1);
    expect(createSponsoredAccountsBatch.mock.calls[0][1]).toMatchObject({ publicKey: core });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { extras: expect.objectContaining({ stellarSponsorError: expect.stringContaining('INSUFFICIENT_SPONSOR_FUNDS') }) },
      })
    );
  });

  it('uses the project sponsor only when platform has no core configured', async () => {
    const sign = jest.fn();
    const processor = processorWith(null, sign);

    await processor.processSponsorQueueSerial(job);

    expect(createSponsoredAccountsBatch).toHaveBeenCalledTimes(1);
    expect(createSponsoredAccountsBatch.mock.calls[0][1]).toBeUndefined();
    expect(sign).not.toHaveBeenCalled();
  });
});

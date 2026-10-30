import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { PrismaService } from '@rumsan/prisma';
import { ReservePayer, StellarClient } from '@rahataid/stellar';
import { BQUEUE, CORE_MODULE, JOBS, STELLAR_CLIENT } from '../constants';

interface SponsorBatchJobData {
  groupUuid: string;
  beneficiaries: { beneficiaryId: string; walletAddress: string }[];
}

// job data for FUND_STELLAR_ACCOUNT — one vendor's wallet per job
interface FundStellarAccountJobData {
  walletAddress: string;
}

type BeneficiaryRef = { beneficiaryId: string; walletAddress: string };

/** Platform's Core Sponsor, as returned by rahat.jobs.wallet.getCoreSponsorStatus. */
type CoreSponsorStatus = { publicKey: string; networkPassphrase: string; freeStroops: number } | null;

// All three operations below share one sponsor account's sequence number, so
// they're all queued under the single SPONSOR_QUEUE_SERIAL job name (dispatched
// by `type` here) instead of three separate job names — Bull's `concurrency: 1`
// is per job NAME, so three different names on the same queue would still run
// concurrently against each other even though each is individually capped at 1.
// Literal tags, not the JOBS constants, since JOBS isn't `as const` — its values
// type as plain `string`, which wouldn't let the switch below narrow the union.
type SponsorQueueSerialJobData =
  | ({ type: 'SPONSOR_ACCOUNTS_BATCH' } & SponsorBatchJobData)
  | ({ type: 'REVOKE_SPONSORSHIP_BATCH' } & SponsorBatchJobData)
  | ({ type: 'FUND_STELLAR_ACCOUNT' } & FundStellarAccountJobData);

@Processor(BQUEUE.STELLAR_SPONSOR)
@Injectable()
export class StellarSponsorProcessor {
  private readonly logger = new Logger(StellarSponsorProcessor.name);

  constructor(
    @Inject(STELLAR_CLIENT) private readonly stellarClient: StellarClient,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Single entry point for every job on this queue — dispatches by `type` to
   * one of the three private handlers below. This is what actually serializes
   * sponsor batches, revoke batches, and vendor XLM funding against each
   * other: they all hit this one job name, so Bull's `concurrency: 1` here
   * applies across all three, not just within each one individually.
   */
  @Process({ name: JOBS.STELLAR.SPONSOR_QUEUE_SERIAL, concurrency: 1 })
  async processSponsorQueueSerial(job: Job<SponsorQueueSerialJobData>) {
    const logPrefix = `[Job ${job.id}]`;
    switch (job.data.type) {
      case 'SPONSOR_ACCOUNTS_BATCH':
        return this.sponsorAccountsBatch(logPrefix, job.data);
      case 'REVOKE_SPONSORSHIP_BATCH':
        return this.revokeSponsorshipBatch(logPrefix, job.data);
      case 'FUND_STELLAR_ACCOUNT':
        return this.fundStellarAccount(logPrefix, job.data);
      default: {
        // exhaustiveness check — a new `type` added to the union without a case here is a compile error
        const unreachable: never = job.data;
        return unreachable;
      }
    }
  }

  //TODO: once sponsorship is completed tag group as ready for disburseemnt.
  //this only applies when the chain.type in chain settings is set to stellar and the STELLAR_SPONSOR_SETTINGS is configured.
  private async sponsorAccountsBatch(logPrefix: string, data: SponsorBatchJobData) {
    const { groupUuid, beneficiaries } = data;
    logPrefix = `${logPrefix}[group ${groupUuid}]`;
    this.logger.log(`${logPrefix} Processing batch of ${beneficiaries.length} beneficiaries`);

    const { resolved, keypairs } = await this.resolveKeypairs(logPrefix, beneficiaries);
    if (resolved.length === 0) return;

    this.logger.log(`${logPrefix} Submitting sponsored account creation for ${keypairs.length} keypair(s)`);
    let result: Awaited<ReturnType<StellarClient['createSponsoredAccountsBatch']>>;
    try {
      const core = await this.getCoreSponsor();
      result = await this.stellarClient.createSponsoredAccountsBatch(keypairs, core ? this.coreReservePayer(core) : undefined);
    } catch (error) {
      await this.markBeneficiariesFailed(logPrefix, resolved, error, 'stellarSponsorError', 'stellarSponsorFailedAt');
      throw error;
    }

    for (const account of result.accounts) {
      if (account.action === 'already-sponsored') {
        this.logger.log(`${logPrefix} Account ${account.publicKey} already sponsored with a trustline — nothing to do`);
      } else if (account.action === 'trustline-only') {
        this.logger.log(`${logPrefix} Account ${account.publicKey} already existed (sponsored elsewhere) — created trustline only`);
      }
    }
    this.logger.log(`${logPrefix} Sponsorship tx submitted: ${result.hash ?? '(none — all accounts already sponsored)'}`);

    await this.markBeneficiariesSponsored(logPrefix, resolved, keypairs, result.accounts);

    this.logger.log(`${logPrefix} Batch complete — sponsored ${resolved.length} account(s) (tx ${result.hash ?? 'none'})`);
  }

  /**
   * Closes out a group's beneficiaries entirely: closes their trustline (if
   * any) and merges the account into the sponsor, deleting it from the
   * ledger and sweeping back any leftover reserve. This is what actually
   * backs "revoke sponsorship for a group" for this project — a plain
   * revoke-to-beneficiary doesn't work here since beneficiaries are created
   * with 0 XLM and can never cover the reserve a revoke would drop on them;
   * merging sidesteps that by deleting the entries instead of reassigning
   * who backs them. One-way door: the account is gone afterward.
   */
  private async revokeSponsorshipBatch(logPrefix: string, data: SponsorBatchJobData) {
    const { groupUuid, beneficiaries } = data;
    logPrefix = `${logPrefix}[group ${groupUuid}]`;
    this.logger.log(`${logPrefix} Closing out ${beneficiaries.length} beneficiaries (merge to sponsor)`);

    const { resolved, keypairs } = await this.resolveKeypairs(logPrefix, beneficiaries);
    if (resolved.length === 0) return;

    let result: Awaited<ReturnType<StellarClient['mergeSponsoredAccountsBatch']>>;
    try {
      // Merging releases each reserve to whichever sponsor held it (core or, for legacy accounts,
      // this project's sponsor) without that sponsor signing, so only the swept XLM needs a home.
      const core = await this.getCoreSponsor();
      result = await this.stellarClient.mergeSponsoredAccountsBatch(keypairs, core?.publicKey);
    } catch (error) {
      await this.markBeneficiariesFailed(logPrefix, resolved, error, 'stellarSponsorRevokeError', 'stellarSponsorRevokeFailedAt');
      throw error;
    }

    for (const account of result.accounts) {
      if (account.status === 'not-found') {
        this.logger.warn(`${logPrefix} Account ${account.publicKey} does not exist — nothing to close out`);
      } else if (account.status === 'nonzero-balance') {
        this.logger.warn(`${logPrefix} Account ${account.publicKey} still holds a nonzero asset balance — skipped, redeem/transfer it first`);
      } else {
        this.logger.log(`${logPrefix} Account ${account.publicKey} closed out (trustline closed, account merged into sponsor)`);
      }
    }
    this.logger.log(`${logPrefix} Merge tx submitted: ${result.hash ?? '(none — nothing in the batch was mergeable)'}`);

    await this.markBeneficiariesMerged(logPrefix, resolved, result.accounts);

    this.logger.log(`${logPrefix} Close-out batch complete for ${beneficiaries.length} beneficiary/ies (tx ${result.hash ?? 'none'})`);
  }

  /**
   * Platform's Core Sponsor, or null when none is configured, in which case this project's own
   * sponsor backs reserves as before. A failed call throws rather than falling back, so reserves
   * never silently land on the project sponsor while a Core Sponsor exists.
   */
  private async getCoreSponsor(): Promise<CoreSponsorStatus> {
    const core: CoreSponsorStatus = await lastValueFrom(
      this.client.send({ cmd: JOBS.WALLET.GET_CORE_SPONSOR_STATUS }, {})
    );
    if (core && core.networkPassphrase !== this.stellarClient.networkPassphrase) {
      throw new Error(
        `Core sponsor is on "${core.networkPassphrase}" but this project is on "${this.stellarClient.networkPassphrase}"`
      );
    }
    return core;
  }

  /** Signs through platform, which validates the tx and the core's free XLM before adding its signature. */
  private coreReservePayer(core: NonNullable<CoreSponsorStatus>): ReservePayer {
    return {
      publicKey: core.publicKey,
      sign: async (tx) => {
        let signed: { xdr: string };
        try {
          signed = await lastValueFrom(
            this.client.send(
              { cmd: JOBS.WALLET.SIGN_SPONSORSHIP_TX },
              { projectUuid: process.env.PROJECT_ID, xdr: tx.toXDR() }
            )
          );
        } catch (error: any) {
          // RpcExceptions arrive as plain objects; keep code/params (e.g. INSUFFICIENT_SPONSOR_FUNDS shortfall)
          throw Object.assign(new Error(error?.message ?? String(error)), { code: error?.code, params: error?.params });
        }
        const signedTx = TransactionBuilder.fromXDR(signed.xdr, this.stellarClient.networkPassphrase) as Transaction;
        if (!signedTx.hash().equals(tx.hash())) throw new Error('Platform returned a different transaction than it was asked to sign');
        return signedTx;
      },
    };
  }

  /** Fetches wallet secrets for a batch and derives keypairs, shared by both the sponsor and merge/revoke flows. Logs and rethrows on RPC failure, warns on unresolved wallets, and returns an empty result (already logged) if nothing resolved. */
  private async resolveKeypairs(
    logPrefix: string,
    beneficiaries: BeneficiaryRef[]
  ): Promise<{ resolved: BeneficiaryRef[]; keypairs: Keypair[] }> {
    const walletAddresses = beneficiaries.map((b) => b.walletAddress);
    this.logger.log(`${logPrefix} Fetching secrets for ${walletAddresses.length} wallet(s)`);

    let walletDetails: { address: string; privateKey: string }[];
    try {
      walletDetails = await lastValueFrom(
        this.client.send({ cmd: JOBS.WALLET.GET_BULK_SECRET_BY_WALLET }, { walletAddresses, chain: 'stellar' })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`${logPrefix} Failed to fetch wallet secrets: ${message}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
    this.logger.log(`${logPrefix} Received ${walletDetails.length} secret(s)`);

    const secretByWallet = new Map(walletDetails.map((w) => [w.address, w.privateKey]));
    const resolved = beneficiaries.filter((b) => secretByWallet.has(b.walletAddress));
    if (resolved.length < beneficiaries.length) {
      const missing = beneficiaries.filter((b) => !secretByWallet.has(b.walletAddress));
      this.logger.warn(
        `${logPrefix} ${missing.length} beneficiary wallet(s) had no secret — skipping them: ${missing.map((b) => b.beneficiaryId).join(', ')}`
      );
    }

    if (resolved.length === 0) {
      this.logger.warn(`${logPrefix} No beneficiaries had resolvable wallet secrets — nothing to process, aborting batch`);
      return { resolved: [], keypairs: [] };
    }

    const keypairs = resolved.map((b) => Keypair.fromSecret(secretByWallet.get(b.walletAddress) as string));
    return { resolved, keypairs };
  }

  /** Persists a batch-level failure onto each affected beneficiary's extras so it's queryable, without losing existing extras. Logs (rather than swallows) any DB error encountered along the way. Shared by the sponsor and merge/revoke flows via distinct field names. */
  private async markBeneficiariesFailed(
    logPrefix: string,
    resolved: BeneficiaryRef[],
    error: unknown,
    errorField: string,
    failedAtField: string
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `${logPrefix} Batch FAILED for ${resolved.length} beneficiary/ies (${resolved.map((b) => b.beneficiaryId).join(', ')}): ${message}`,
      error instanceof Error ? error.stack : undefined
    );

    const failedUuids = resolved.map((b) => b.beneficiaryId);
    let failedRecords: { uuid: string; extras: unknown }[];
    try {
      failedRecords = await this.prisma.beneficiary.findMany({ where: { uuid: { in: failedUuids } } });
    } catch (dbError) {
      this.logger.error(`${logPrefix} Could not look up beneficiaries to record failure: ${dbError}`);
      return;
    }
    if (failedRecords.length < failedUuids.length) {
      const foundUuids = new Set(failedRecords.map((r) => r.uuid));
      const missing = failedUuids.filter((uuid) => !foundUuids.has(uuid));
      this.logger.warn(`${logPrefix} Beneficiary/ies not found in DB, could not record failure for: ${missing.join(', ')}`);
    }

    const outcomes = await Promise.allSettled(
      failedRecords.map((benf) =>
        this.prisma.beneficiary.update({
          where: { uuid: benf.uuid },
          data: {
            extras: {
              ...((benf.extras as object) ?? {}),
              [errorField]: message,
              [failedAtField]: new Date().toISOString(),
            },
          },
        })
      )
    );
    outcomes.forEach((outcome, idx) => {
      if (outcome.status === 'rejected') {
        this.logger.error(`${logPrefix} Failed to persist failure for beneficiary ${failedRecords[idx].uuid}: ${outcome.reason}`);
      }
    });
  }

  /** Marks each successfully-processed beneficiary as sponsored, recording which action was taken (created / trustline-only / already-sponsored). Logs per-record failures instead of letting one bad update abort the rest. */
  private async markBeneficiariesSponsored(
    logPrefix: string,
    resolved: BeneficiaryRef[],
    keypairs: Keypair[],
    accounts: Awaited<ReturnType<StellarClient['createSponsoredAccountsBatch']>>['accounts']
  ): Promise<void> {
    const uuids = resolved.map((b) => b.beneficiaryId);
    let records: { uuid: string; extras: unknown }[];
    try {
      records = await this.prisma.beneficiary.findMany({ where: { uuid: { in: uuids } } });
    } catch (dbError) {
      this.logger.error(`${logPrefix} Could not look up beneficiaries to record sponsorship success: ${dbError}`);
      return;
    }
    const byUuid = new Map(records.map((r) => [r.uuid, r]));

    this.logger.log(`${logPrefix} Updating ${uuids.length} beneficiary record(s) in DB`);
    const outcomes = await Promise.allSettled(
      uuids.map((uuid, idx) => {
        const benf = byUuid.get(uuid);
        if (!benf) {
          this.logger.warn(`${logPrefix} Beneficiary ${uuid} not found in DB — skipping update`);
          return Promise.resolve(null);
        }
        return this.prisma.beneficiary.update({
          where: { uuid },
          data: {
            extras: {
              ...((benf.extras as object) ?? {}),
              stellarSponsored: true,
              stellarPublicKey: keypairs[idx].publicKey(),
              stellarSponsorAction: accounts[idx].action,
            },
          },
        });
      })
    );
    outcomes.forEach((outcome, idx) => {
      if (outcome.status === 'rejected') {
        this.logger.error(`${logPrefix} Failed to persist sponsorship success for beneficiary ${uuids[idx]}: ${outcome.reason}`);
      }
    });
  }

  /** Persists the merge outcome (mergeable / not-found / nonzero-balance) onto each beneficiary's extras. Logs per-record failures instead of letting one bad update abort the rest. */
  private async markBeneficiariesMerged(
    logPrefix: string,
    resolved: BeneficiaryRef[],
    accounts: Awaited<ReturnType<StellarClient['mergeSponsoredAccountsBatch']>>['accounts']
  ): Promise<void> {
    const uuids = resolved.map((b) => b.beneficiaryId);
    let records: { uuid: string; extras: unknown }[];
    try {
      records = await this.prisma.beneficiary.findMany({ where: { uuid: { in: uuids } } });
    } catch (dbError) {
      this.logger.error(`${logPrefix} Could not look up beneficiaries to record merge outcome: ${dbError}`);
      return;
    }
    const byUuid = new Map(records.map((r) => [r.uuid, r]));

    this.logger.log(`${logPrefix} Updating ${uuids.length} beneficiary record(s) in DB with merge outcome`);
    const outcomes = await Promise.allSettled(
      uuids.map((uuid, idx) => {
        const benf = byUuid.get(uuid);
        if (!benf) {
          this.logger.warn(`${logPrefix} Beneficiary ${uuid} not found in DB — skipping update`);
          return Promise.resolve(null);
        }
        return this.prisma.beneficiary.update({
          where: { uuid },
          data: {
            extras: {
              ...((benf.extras as object) ?? {}),
              stellarAccountMergedStatus: accounts[idx].status,
              stellarAccountMerged: accounts[idx].status === 'mergeable',
              stellarAccountMergedAt: new Date().toISOString(),
            },
          },
        });
      })
    );
    outcomes.forEach((outcome, idx) => {
      if (outcome.status === 'rejected') {
        this.logger.error(`${logPrefix} Failed to persist merge outcome for beneficiary ${uuids[idx]}: ${outcome.reason}`);
      }
    });
  }

  /**
   * Funds a vendor's wallet with XLM on vendor assignment (moved here from
   * ListernersService.handleVendorAssignment). Same sponsor account as the
   * sponsor/revoke batches above — firing fundAccountWithXlm directly from the
   * event handler raced the sponsor account's sequence number whenever
   * multiple vendors were assigned close together (or a sponsor/revoke batch
   * ran at the same time), causing a Stellar nonce error. Dispatched through
   * processSponsorQueueSerial above, so it's now serialized against those too.
   */
  private async fundStellarAccount(logPrefix: string, data: FundStellarAccountJobData) {
    const { walletAddress } = data;
    logPrefix = `${logPrefix}[wallet ${walletAddress}]`;

    if (!this.stellarClient) {
      this.logger.warn(
        `${logPrefix} STELLAR_SPONSOR_SETTINGS not configured (or chain is not Stellar) — skipping XLM funding`
      );
      return;
    }

    this.logger.log(`${logPrefix} Funding wallet with XLM`);
    const result = await this.stellarClient.fundAccountWithXlm(walletAddress, '2');
    this.logger.log(`${logPrefix} Funded with 2 XLM, tx: ${result.hash}`);
  }

  @OnQueueFailed()
  onFailed(job: Job<SponsorQueueSerialJobData>, error: Error) {
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
    // all jobs share the one SPONSOR_QUEUE_SERIAL name now, so job.data.type is
    // the useful label here, not job.name; FUND_STELLAR_ACCOUNT carries a
    // walletAddress instead of a groupUuid
    const subject =
      'groupUuid' in job.data ? `group ${job.data.groupUuid}` : `wallet ${job.data.walletAddress}`;
    this.logger.error(
      `[Job ${job.id}][${subject}] ${job.data.type} attempt ${job.attemptsMade}/${job.opts.attempts ?? 1} FAILED${isLastAttempt ? ' (no retries left)' : ''}: ${error.message}`,
      error.stack
    );
  }
}

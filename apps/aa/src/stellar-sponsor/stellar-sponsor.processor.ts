import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Keypair } from '@stellar/stellar-sdk';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { PrismaService } from '@rumsan/prisma';
import { StellarClient } from '@rahataid/stellar';
import { BQUEUE, CORE_MODULE, JOBS, STELLAR_CLIENT } from '../constants';

interface SponsorBatchJobData {
  groupUuid: string;
  beneficiaries: { beneficiaryId: string; walletAddress: string }[];
}

@Processor(BQUEUE.STELLAR_SPONSOR)
@Injectable()
export class StellarSponsorProcessor {
  private readonly logger = new Logger(StellarSponsorProcessor.name);

  constructor(
    @Inject(STELLAR_CLIENT) private readonly stellarClient: StellarClient,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly prisma: PrismaService
  ) {}

  //TODO: once sponsorship is completed tag group as ready for disburseemnt.
  //this only applies when the chain.type in chain settings is set to stellar and the STELLAR_SPONSOR_SETTINGS is configured.
  @Process({ name: JOBS.STELLAR.SPONSOR_ACCOUNTS_BATCH, concurrency: 1 })
  async sponsorAccountsBatch(job: Job<SponsorBatchJobData>) {
    const { groupUuid, beneficiaries } = job.data;
    const logPrefix = `[Job ${job.id}][group ${groupUuid}]`;
    this.logger.log(`${logPrefix} Processing batch of ${beneficiaries.length} beneficiaries`);

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
      this.logger.warn(`${logPrefix} No beneficiaries had resolvable wallet secrets — nothing to sponsor, aborting batch`);
      return;
    }

    const keypairs = resolved.map((b) => Keypair.fromSecret(secretByWallet.get(b.walletAddress) as string));

    this.logger.log(`${logPrefix} Submitting sponsored account creation for ${keypairs.length} keypair(s)`);
    let result: Awaited<ReturnType<StellarClient['createSponsoredAccountsBatch']>>;
    try {
      result = await this.stellarClient.createSponsoredAccountsBatch(keypairs);
    } catch (error) {
      await this.markBeneficiariesFailed(logPrefix, resolved, error);
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

  /** Persists sponsorship failure onto each affected beneficiary's extras so it's queryable, without losing existing extras. Logs (rather than swallows) any DB error encountered along the way. */
  private async markBeneficiariesFailed(
    logPrefix: string,
    resolved: { beneficiaryId: string; walletAddress: string }[],
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `${logPrefix} Sponsorship batch FAILED for ${resolved.length} beneficiary/ies (${resolved.map((b) => b.beneficiaryId).join(', ')}): ${message}`,
      error instanceof Error ? error.stack : undefined
    );

    const failedUuids = resolved.map((b) => b.beneficiaryId);
    let failedRecords: { uuid: string; extras: unknown }[];
    try {
      failedRecords = await this.prisma.beneficiary.findMany({ where: { uuid: { in: failedUuids } } });
    } catch (dbError) {
      this.logger.error(`${logPrefix} Could not look up beneficiaries to record sponsorship failure: ${dbError}`);
      return;
    }

    const outcomes = await Promise.allSettled(
      failedRecords.map((benf) =>
        this.prisma.beneficiary.update({
          where: { uuid: benf.uuid },
          data: {
            extras: {
              ...((benf.extras as object) ?? {}),
              stellarSponsorError: message,
              stellarSponsorFailedAt: new Date().toISOString(),
            },
          },
        })
      )
    );
    outcomes.forEach((outcome, idx) => {
      if (outcome.status === 'rejected') {
        this.logger.error(`${logPrefix} Failed to persist sponsorship failure for beneficiary ${failedRecords[idx].uuid}: ${outcome.reason}`);
      }
    });
  }

  /** Marks each successfully-processed beneficiary as sponsored, recording which action was taken (created / trustline-only / already-sponsored). Logs per-record failures instead of letting one bad update abort the rest. */
  private async markBeneficiariesSponsored(
    logPrefix: string,
    resolved: { beneficiaryId: string; walletAddress: string }[],
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

  @OnQueueFailed()
  onFailed(job: Job<SponsorBatchJobData>, error: Error) {
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
    this.logger.error(
      `[Job ${job.id}][group ${job.data.groupUuid}] Sponsorship batch attempt ${job.attemptsMade}/${job.opts.attempts ?? 1} FAILED${isLastAttempt ? ' (no retries left)' : ''}: ${error.message}`,
      error.stack
    );
  }
}

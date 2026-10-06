import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { RpcException } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import {
  sponsorFreeStroops,
  sponsorRequiredStroops,
  StellarClient,
  StellarClientConfig,
  STROOPS_PER_XLM,
} from '@rahataid/stellar';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import { BQUEUE, EVENTS, JOBS, STELLAR_SPONSOR_BATCH_SIZE } from '../constants';

@Injectable()
export class StellarSponsorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StellarSponsorService.name);
  private isStellarChain = false;

  constructor(
    @InjectQueue(BQUEUE.STELLAR_SPONSOR) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService
  ) {}

  async onApplicationBootstrap() {
    try {
      const chainSettings = await this.settingsService.getPublic('CHAIN_SETTINGS');
      this.isStellarChain = (chainSettings?.value as any)?.type === 'stellar';

      if (!this.isStellarChain) {
        this.logger.log('Chain type is not Stellar — StellarSponsorService will remain inactive.');
        return;
      }

      const sponsorSettings = await this.settingsService.getPublic('STELLAR_SPONSOR_SETTINGS');
      if (!sponsorSettings?.value) {
        this.logger.warn(
          'Chain type is Stellar but STELLAR_SPONSOR_SETTINGS is not configured. ' +
          'Stellar account sponsorship will be disabled until the setting is added.'
        );
      }
    } catch (err: any) {
      this.logger.warn(`Failed to load settings during bootstrap: ${err?.message}`);
    }
  }

  @OnEvent(EVENTS.BENEFICIARY_GROUP_ADDED_TO_PROJECT)
  async sponsorBeneficiaries(payload: { groupUuid: string }) {
    const { groupUuid } = payload;
    this.logger.debug(`Sponsoring beneficiaries for group ${groupUuid}`);

    if (!(await this.isSponsorshipEnabled(groupUuid))) return;

    const beneficiaries = await this.getGroupBeneficiaries(groupUuid);
    if (!beneficiaries.length) {
      this.logger.warn(`No wallet addresses found for group ${groupUuid}`);
      return;
    }

    await this.queueSponsorBatches(groupUuid, beneficiaries);
  }

  /**
   * Rejects a group assignment the sponsor wallet cannot finish sponsoring, before anything is
   * persisted. No-op when the chain is not Stellar or sponsorship is not configured.
   *
   * Funds already reserved are not free: Stellar locks reserve on the sponsor for every account
   * and trustline it sponsors, so only balance - minimum balance (read from the chain) counts.
   * Beneficiaries that are still waiting to be sponsored (queued jobs and import batches not yet
   * processed) will lock funds too, so they count against the free balance as well.
   */
  async assertSponsorFundsForGroup(beneficiaries: { uuid: string; walletAddress?: string }[]) {
    const client = await this.loadSponsorClient();
    if (!client) return;

    const demand = await this.countBeneficiariesNeedingSponsorship(beneficiaries);
    if (demand === 0) return;

    const info = await client.getSponsorAccountInfo();
    const free = sponsorFreeStroops(info);
    const required = sponsorRequiredStroops(demand);
    if (free >= required) return;

    this.logger.warn(
      `Sponsor ${info.publicKey} has ${free / STROOPS_PER_XLM} XLM free, ${required / STROOPS_PER_XLM} XLM needed for ${demand} beneficiaries`
    );
    throw new RpcException({
      message:
        '[INSUFFICIENT_SPONSOR_FUNDS] Not enough funds in the sponsor wallet to complete sponsorship. Please fund it before assigning.',
      code: 'INSUFFICIENT_SPONSOR_FUNDS',
      params: {
        sponsorWallet: info.publicKey,
        beneficiaries: demand,
        requiredXlm: required / STROOPS_PER_XLM,
        availableXlm: free / STROOPS_PER_XLM,
        shortfallXlm: (required - free) / STROOPS_PER_XLM,
      },
    });
  }

  // Null unless the chain is Stellar and a sponsor is configured; nothing else is checked then.
  // Read from the DB on every check so a changed sponsor setting is picked up without a restart.
  private async loadSponsorClient(): Promise<StellarClient | null> {
    let sponsorSettings: unknown;
    try {
      const chainSettings = await this.settingsService.getPublic('CHAIN_SETTINGS');
      if ((chainSettings?.value as any)?.type !== 'stellar') return null;
      sponsorSettings = (await this.settingsService.getPublic('STELLAR_SPONSOR_SETTINGS'))?.value;
    } catch (err: any) {
      this.logger.warn(`Sponsor funds check skipped, could not read settings: ${err?.message}`);
      return null;
    }
    if (!sponsorSettings) return null;
    return new StellarClient(sponsorSettings as StellarClientConfig);
  }

  private async countBeneficiariesNeedingSponsorship(
    beneficiaries: { uuid: string; walletAddress?: string }[]
  ): Promise<number> {
    const uuids = beneficiaries.filter((b) => b.walletAddress).map((b) => b.uuid);

    const alreadySponsored = new Set<string>();
    const CHUNK_SIZE = 10000;
    for (let i = 0; i < uuids.length; i += CHUNK_SIZE) {
      const rows = await this.prisma.$queryRaw<{ uuid: string }[]>(Prisma.sql`
        SELECT uuid FROM tbl_beneficiaries
        WHERE uuid = ANY(${uuids.slice(i, i + CHUNK_SIZE)}::uuid[])
          AND extras->>'stellarSponsored' = 'true'`);
      rows.forEach((r) => alreadySponsored.add(r.uuid));
    }
    const fromGroup = uuids.length - alreadySponsored.size;

    const queuedJobs = await this.queue.getJobs(['waiting', 'active', 'delayed', 'paused']);
    const queued = queuedJobs.reduce(
      (sum, job) => sum + (job.name === JOBS.STELLAR.SPONSOR_ACCOUNTS_BATCH ? job.data?.beneficiaries?.length ?? 0 : 0),
      0
    );

    // Rows are deleted once a batch has been written, so what is left is not yet in the DB or queue.
    const [{ pending }] = await this.prisma.$queryRaw<{ pending: bigint }[]>(Prisma.sql`
      SELECT COALESCE(SUM(jsonb_array_length("jobTypeData"->'beneficiaries')), 0) AS pending
      FROM tbl_async_queue_jobs
      WHERE "jobName" = ${JOBS.BENEFICIARY.CREATE_BENEFICIARIES_IN_BATCHES}`);

    // ponytail: a beneficiary in two in-flight groups counts twice, which errs on the safe side
    return fromGroup + queued + Number(pending);
  }

  /**
   * Batched group creation (createBeneficiariesInBatches) emits this once per
   * batch with only that batch's beneficiaries, so each account is queued once
   * instead of re-queuing the whole group on every batch.
   */
  @OnEvent(EVENTS.BENEFICIARY_BATCH_ADDED_TO_GROUP)
  async sponsorBeneficiaryBatch(payload: {
    groupUuid: string;
    beneficiaries: { beneficiaryId: string; walletAddress: string }[];
  }) {
    const { groupUuid } = payload;
    if (!(await this.isSponsorshipEnabled(groupUuid))) return;

    const beneficiaries = payload.beneficiaries.filter((b) => b.walletAddress);
    if (!beneficiaries.length) return;

    await this.queueSponsorBatches(groupUuid, beneficiaries);
  }

  private async queueSponsorBatches(
    groupUuid: string,
    beneficiaries: { beneficiaryId: string; walletAddress: string }[]
  ) {
    this.logger.log(`Queuing ${beneficiaries.length} beneficiaries in batches of ${STELLAR_SPONSOR_BATCH_SIZE} for group ${groupUuid}`);

    for (let i = 0; i < beneficiaries.length; i += STELLAR_SPONSOR_BATCH_SIZE) {
      const batch = beneficiaries.slice(i, i + STELLAR_SPONSOR_BATCH_SIZE);
      await this.queue.add(JOBS.STELLAR.SPONSOR_ACCOUNTS_BATCH, { groupUuid, beneficiaries: batch });
    }

    this.logger.log(
      `Queued ${Math.ceil(beneficiaries.length / STELLAR_SPONSOR_BATCH_SIZE)} sponsorship batch(es) for group ${groupUuid}`
    );
  }

  /**
   * Closes out every beneficiary in the group entirely: closes their
   * trustline and merges the account into the sponsor (see
   * StellarSponsorProcessor.revokeSponsorshipBatch / mergeSponsoredAccountsBatch
   * for why — a plain revoke can't work when beneficiaries hold 0 XLM, since
   * revoke drops the reserve requirement onto an account that can't cover
   * it; merging deletes the entries instead, which needs no balance at all.
   * One-way door: beneficiaries' Stellar accounts are gone afterward.
   * Triggered whenever something wants a group's sponsorship torn down —
   * e.g. a project closes, or an admin explicitly reclaims reserves. Reuses
   * the same queue/processor as `sponsorBeneficiaries`, just a different job
   * type, since both operate on "a group's worth of beneficiaries" batched
   * the same way.
   */
  @OnEvent(EVENTS.BENEFICIARY_GROUP_SPONSORSHIP_REVOKE)
  async revokeSponsorshipForGroup(payload: { groupUuid: string }) {
    const { groupUuid } = payload;
    this.logger.debug(`Closing out sponsorship for group ${groupUuid}`);

    if (!(await this.isSponsorshipEnabled(groupUuid))) return;

    const beneficiaries = await this.getGroupBeneficiaries(groupUuid);
    if (!beneficiaries.length) {
      this.logger.warn(`No wallet addresses found for group ${groupUuid}`);
      return;
    }

    this.logger.log(
      `Queuing close-out for ${beneficiaries.length} beneficiaries in batches of ${STELLAR_SPONSOR_BATCH_SIZE} for group ${groupUuid}`
    );

    for (let i = 0; i < beneficiaries.length; i += STELLAR_SPONSOR_BATCH_SIZE) {
      const batch = beneficiaries.slice(i, i + STELLAR_SPONSOR_BATCH_SIZE);
      await this.queue.add(JOBS.STELLAR.REVOKE_SPONSORSHIP_BATCH, { groupUuid, beneficiaries: batch });
    }

    this.logger.log(
      `Queued ${Math.ceil(beneficiaries.length / STELLAR_SPONSOR_BATCH_SIZE)} close-out batch(es) for group ${groupUuid}`
    );
  }

  /** Guards both event handlers: chain must be Stellar and sponsor settings must be configured. */
  private async isSponsorshipEnabled(groupUuid: string): Promise<boolean> {
    if (!this.isStellarChain) {
      this.logger.debug(`Chain is not Stellar — skipping group ${groupUuid}`);
      return false;
    }

    try {
      const sponsorSettings = await this.settingsService.getPublic('STELLAR_SPONSOR_SETTINGS');
      if (!sponsorSettings?.value) {
        this.logger.debug(`STELLAR_SPONSOR_SETTINGS not configured — skipping group ${groupUuid}`);
        return false;
      }
    } catch {
      this.logger.debug(`STELLAR_SPONSOR_SETTINGS unavailable — skipping group ${groupUuid}`);
      return false;
    }

    return true;
  }

  private async getGroupBeneficiaries(groupUuid: string): Promise<{ beneficiaryId: string; walletAddress: string }[]> {
    const records = await this.prisma.beneficiaryToGroup.findMany({
      where: { groupId: groupUuid },
      select: { beneficiary: { select: { uuid: true, walletAddress: true } } },
    });

    return records
      .map((r) => r.beneficiary)
      .filter((b) => b.walletAddress)
      .map((b) => ({ beneficiaryId: b.uuid, walletAddress: b.walletAddress as string }));
  }
}

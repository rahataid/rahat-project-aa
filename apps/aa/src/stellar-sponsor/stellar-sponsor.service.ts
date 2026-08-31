import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
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

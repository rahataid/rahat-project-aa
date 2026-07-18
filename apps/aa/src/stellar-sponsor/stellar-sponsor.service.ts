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

    if (!this.isStellarChain) {
      this.logger.debug(`Chain is not Stellar — skipping sponsorship for group ${groupUuid}`);
      return;
    }

    try {
      const sponsorSettings = await this.settingsService.getPublic('STELLAR_SPONSOR_SETTINGS');
      if (!sponsorSettings?.value) {
        this.logger.debug(`STELLAR_SPONSOR_SETTINGS not configured — skipping group ${groupUuid}`);
        return;
      }
    } catch {
      this.logger.debug(`STELLAR_SPONSOR_SETTINGS unavailable — skipping group ${groupUuid}`);
      return;
    }

    const records = await this.prisma.beneficiaryToGroup.findMany({
      where: { groupId: groupUuid },
      select: { beneficiary: { select: { uuid: true, walletAddress: true } } },
    });

    const beneficiaries = records
      .map((r) => r.beneficiary)
      .filter((b) => b.walletAddress)
      .map((b) => ({ beneficiaryId: b.uuid, walletAddress: b.walletAddress as string }));

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
}

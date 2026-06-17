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

  constructor(
    @InjectQueue(BQUEUE.STELLAR_SPONSOR) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService
  ) {}

  async onApplicationBootstrap() {
    try {
      const sponsorSettings = await this.settingsService.getPublic('STELLAR_SPONSOR_SETTINGS');
      if (sponsorSettings?.value) return;
    } catch {}

    try {
      const chainSettings = await this.settingsService.getPublic('CHAIN_SETTINGS');
      if ((chainSettings?.value as any)?.type === 'stellar') {
        this.logger.warn(
          'Chain type is Stellar but STELLAR_SPONSOR_SETTINGS is not configured. ' +
          'Stellar account sponsorship will be disabled until the setting is added.'
        );
      }
    } catch {}
  }

  @OnEvent(EVENTS.BENEFICIARY_GROUP_ADDED_TO_PROJECT)
  async onBeneficiaryGroupAdded(payload: { groupUuid: string; beneficiaryIds: string[] }) {
    this.logger.debug(`Received event ${EVENTS.BENEFICIARY_GROUP_ADDED_TO_PROJECT} by sponsor service for ${payload.groupUuid}`);

    try {
      const sponsorSettings = await this.settingsService.getPublic('STELLAR_SPONSOR_SETTINGS');
      if (!sponsorSettings?.value) {
        this.logger.debug('STELLAR_SPONSOR_SETTINGS not configured — skipping sponsorship for group ' + payload.groupUuid);
        return;
      }
    } catch {
      this.logger.debug('STELLAR_SPONSOR_SETTINGS not found — skipping sponsorship for group ' + payload.groupUuid);
      return;
    }

    const { groupUuid, beneficiaryIds } = payload;

    const records = await this.prisma.beneficiary.findMany({
      where: { uuid: { in: beneficiaryIds } },
      select: { uuid: true, walletAddress: true },
    });

    const beneficiaries = records
      .filter((r) => r.walletAddress)
      .map((r) => ({ beneficiaryId: r.uuid, walletAddress: r.walletAddress as string }));

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

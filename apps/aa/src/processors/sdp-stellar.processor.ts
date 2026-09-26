import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SettingsService } from '@rumsan/settings';
import { SdpClient } from '@rahataid/stellar-sdp';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { StellarChainService } from '../chain/chain-services/stellar-chain.service';
import { BQUEUE, EVENTS, JOBS } from '../constants';

// SDP usually completes within seconds, so poll early and back off (15s, 30s, 60s, 2m, then 3m).
const FIRST_STATUS_CHECK_DELAY_MS = 15 * 1000;
const STATUS_CHECK_DELAY_MS = 3 * 60 * 1000; // max gap between checks
const STATUS_CHECK_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
const nextCheckDelay = (poll: number) =>
  Math.min(FIRST_STATUS_CHECK_DELAY_MS * 2 ** poll, STATUS_CHECK_DELAY_MS);

@Processor(BQUEUE.STELLAR_SDP)
@Injectable()
export class SdpStellarProcessor {
  private readonly logger = new Logger(SdpStellarProcessor.name);
  private sdpClient: SdpClient | null = null;

  constructor(
    @InjectQueue(BQUEUE.STELLAR_SDP) private readonly stellarSdpQueue: Queue,
    private readonly beneficiaryService: BeneficiaryService,
    private readonly stellarChainService: StellarChainService,
    private readonly settingsService: SettingsService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  private async getSdpClient(): Promise<SdpClient> {
    if (this.sdpClient) return this.sdpClient;

    const sdpSettings = await this.settingsService.getPublic('SDP_SETTINGS');
    if (!sdpSettings?.value) {
      throw new Error('SDP_SETTINGS not found in settings table');
    }

    const config = sdpSettings.value as Record<string, string>;
    console.log('SDP Settings:', config);
    this.sdpClient = new SdpClient({
      sdpUrl: config.sdpUrl,
      tenantName: config.tenantName,
      apiKey: config.apiKey,
    });

    return this.sdpClient;
  }

  private async getSdpSettings(): Promise<Record<string, string>> {
    const sdpSettings = await this.settingsService.getPublic('SDP_SETTINGS');
    if (!sdpSettings?.value) {
      throw new Error('SDP_SETTINGS not found in settings table');
    }
    return sdpSettings.value as Record<string, string>;
  }

  @Process({ name: JOBS.STELLAR_SDP.DISBURSE, concurrency: 1 })
  async handleDisburse(
    job: Job<{ dName: string; groups: string[]; skipStatusUpdate?: boolean }>
  ): Promise<void> {
    const { dName, groups, skipStatusUpdate } = job.data;
    const groupUuid = groups[0];

    this.logger.log(
      `Processing SDP disbursement for group ${groupUuid}: ${dName}`
    );

    try {
      const groupToken =
        await this.beneficiaryService.getOneTokenReservationByGroupId(
          groupUuid
        );

      if (!groupToken) {
        this.logger.warn(`No token reservation found for group ${groupUuid}`);
        return;
      }

      const benData = await this.stellarChainService.getBeneficiaryTokenBalance(
        [groupUuid]
      );

      if (!benData.length) {
        this.logger.warn(`No beneficiaries found for group ${groupUuid}`);
        return;
      }

      this.logger.log(
        `Generating CSV for ${benData.length} beneficiaries in group ${groupUuid}`
      );

      const csvBuffer = this.stellarChainService.generateCsv(benData);
      const sdpClient = await this.getSdpClient();
      console.log('SDP Client initialized:');
      const sdpSettings = await this.getSdpSettings();
      console.log('SDP Settings retrieved:', sdpSettings);

      this.logger.log({
        name: dName,
        wallet_id: sdpSettings.walletId,
        asset_id: sdpSettings.assetId,
        verification_field: sdpSettings.verificationField,
        filename: `${dName}_instructions.csv`,
      });
      const disbursement = await sdpClient.disbursements.create({
        name: dName,
        wallet_id: sdpSettings.walletId,
        asset_id: sdpSettings.assetId,
        registration_contact_type: 'PHONE_NUMBER_AND_WALLET_ADDRESS',
        verification_field: sdpSettings.verificationField,
        receiver_registration_message_template: '',
        file: csvBuffer,
        filename: `${dName}_instructions.csv`,
      });

      this.logger.log(
        `SDP disbursement created: ${disbursement.id} for group ${groupUuid}`
      );

      await sdpClient.disbursements.updateStatus(disbursement.id, {
        status: 'STARTED',
      });

      this.logger.log(
        `SDP disbursement ${disbursement.id} status updated to STARTED`
      );

      await this.beneficiaryService.updateGroupToken({
        groupUuid,
        status: skipStatusUpdate ? groupToken.status : 'STARTED',
        isDisbursed: false,
        info: {
          ...(groupToken.info && {
            ...JSON.parse(JSON.stringify(groupToken.info)),
          }),
          disbursement,
          disbursementStartedAt: new Date().toISOString(),
        },
      });

      if (skipStatusUpdate) {
        this.logger.log(
          `Skipping status polling for group ${groupUuid} (disburse-on-create); status will be reconciled on explicit disburse`
        );
        return;
      }

      await this.stellarSdpQueue.add(
        JOBS.STELLAR_SDP.DISBURSEMENT_STATUS_UPDATE,
        {
          disbursementId: disbursement.id,
          groupUuid,
          startedAt: Date.now(),
          poll: 0,
        },
        {
          delay: nextCheckDelay(0),
          attempts: 3,
          removeOnComplete: true,
          backoff: { type: 'exponential', delay: 5000 },
        }
      );
    } catch (error: any) {
      this.logger.error(
        `SDP disbursement failed for group ${groupUuid}: ${error.message}`,
        error.stack
      );

      await this.beneficiaryService.updateGroupToken({
        groupUuid,
        status: 'FAILED',
        isDisbursed: false,
        info: {
          error: error.message,
          failedAt: new Date().toISOString(),
        },
      });

      throw error;
    }
  }

  @Process({
    name: JOBS.STELLAR_SDP.DISBURSEMENT_STATUS_UPDATE,
    concurrency: 1,
  })
  async handleStatusUpdate(
    job: Job<{
      disbursementId: string;
      groupUuid: string;
      startedAt: number;
      poll?: number;
    }>
  ): Promise<void> {
    const { disbursementId, groupUuid, startedAt, poll = 0 } = job.data;
    const tag = `[SdpStatus] group=${groupUuid} disbursement=${disbursementId}`;

    this.logger.log(`${tag} check #${poll + 1} (job ${job.id})`);

    try {
      // Duplicate/stale jobs are expected (explicit disburse queues an immediate check on top of
      // the delayed one, and an old cycle's job can outlive it). They must be no-ops, not errors:
      // updateGroupToken only finds an undisbursed token and would throw and burn all retries.
      const token = await this.beneficiaryService.getOneTokenReservationByGroupId(
        groupUuid
      );
      const tokenDisbursementId = (token?.info as any)?.disbursement?.id;
      if (!token) {
        this.logger.warn(`${tag} no token reservation found, dropping check`);
        return;
      }
      if (tokenDisbursementId !== disbursementId) {
        this.logger.warn(
          `${tag} stale check: latest token ${token.uuid} tracks disbursement ${tokenDisbursementId}, dropping`
        );
        return;
      }
      if (token.isDisbursed) {
        this.logger.log(
          `${tag} token ${token.uuid} already DISBURSED (duplicate check), nothing to do`
        );
        return;
      }

      const sdpClient = await this.getSdpClient();
      const disbursement = await sdpClient.disbursements.get(disbursementId);
      const status = disbursement.status?.toUpperCase();

      this.logger.log(`${tag} SDP status: ${status}`);

      const existingInfo = token.info
        ? JSON.parse(JSON.stringify(token.info))
        : {};
      const realStartedAt = existingInfo.disbursementStartedAt
        ? new Date(existingInfo.disbursementStartedAt).getTime()
        : startedAt;

      if (status === 'COMPLETED') {
        const disbursementTimeTaken = Date.now() - realStartedAt;

        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'DISBURSED',
          isDisbursed: true,
          info: {
            ...existingInfo,
            disbursement,
            disbursementTimeTaken,
            completedAt: new Date().toISOString(),
          },
        });

        this.eventEmitter.emit(EVENTS.TOKEN_DISBURSED, { groupUuid });

        this.logger.log(
          `${tag} COMPLETED -> token ${token.uuid} DISBURSED after ${disbursementTimeTaken}ms`
        );
        return;
      }

      if (status === 'FAILED' || status === 'ERROR') {
        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'FAILED',
          isDisbursed: false,
          info: {
            ...existingInfo,
            disbursement,
            error: `SDP disbursement ${status}`,
            failedAt: new Date().toISOString(),
          },
        });

        this.logger.error(`${tag} ${status} -> token ${token.uuid} FAILED`);
        return;
      }

      // Still in progress — re-queue if within timeout
      const elapsed = Date.now() - startedAt;
      if (elapsed > STATUS_CHECK_TIMEOUT_MS) {
        this.logger.error(`${tag} timed out after 24h -> token ${token.uuid} FAILED`);

        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'FAILED',
          isDisbursed: false,
          info: {
            ...existingInfo,
            disbursement,
            error: 'Disbursement timed out after 24 hours',
            failedAt: new Date().toISOString(),
          },
        });
        return;
      }

      const delay = nextCheckDelay(poll + 1);
      this.logger.log(
        `${tag} still ${status}, re-checking in ${delay / 1000}s (elapsed ${Math.round(
          elapsed / 1000
        )}s)`
      );

      await this.stellarSdpQueue.add(
        JOBS.STELLAR_SDP.DISBURSEMENT_STATUS_UPDATE,
        { disbursementId, groupUuid, startedAt, poll: poll + 1 },
        {
          delay,
          attempts: 3,
          removeOnComplete: true,
          backoff: { type: 'exponential', delay: 5000 },
        }
      );
    } catch (error) {
      this.logger.error(
        `${tag} error checking status: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }
}

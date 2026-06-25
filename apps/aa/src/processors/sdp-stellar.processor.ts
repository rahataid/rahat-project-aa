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

const STATUS_CHECK_DELAY_MS = 3 * 60 * 1000; // 3 minutes
const STATUS_CHECK_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

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
    job: Job<{ dName: string; groups: string[] }>
  ): Promise<void> {
    const { dName, groups } = job.data;
    const groupUuid = groups[0];

    this.logger.log(
      `Processing SDP disbursement for group ${groupUuid}: ${dName}`
    );

    try {
      const group =
        await this.beneficiaryService.getOneTokenReservationByGroupId(
          groupUuid
        );

      if (!group) {
        this.logger.warn(`No token reservation found for group ${groupUuid}`);
        return;
      }

      const benData =
        await this.stellarChainService.getBeneficiaryTokenBalance([groupUuid]);

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


      this.logger.log(
        {
        name: dName,
        wallet_id: sdpSettings.walletId,
        asset_id: sdpSettings.assetId,
        verification_field: sdpSettings.verificationField,
        filename: `${dName}_instructions.csv`,
      })
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

      await this.beneficiaryService.updateGroupToken({
        groupUuid,
        status: 'STARTED',
        isDisbursed: false,
        info: {
          ...(group.info && { ...JSON.parse(JSON.stringify(group.info)) }),
          disbursement,
          disbursementStartedAt: new Date().toISOString(),
        },
      });

      await this.stellarSdpQueue.add(
        JOBS.STELLAR_SDP.DISBURSEMENT_STATUS_UPDATE,
        {
          disbursementId: disbursement.id,
          groupUuid,
          startedAt: Date.now(),
        },
        {
          delay: STATUS_CHECK_DELAY_MS,
          attempts: 3,
          removeOnComplete: true,
          backoff: { type: 'exponential', delay: 5000 },
        }
      );
    } catch (error) {
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

  @Process({ name: JOBS.STELLAR_SDP.DISBURSEMENT_STATUS_UPDATE, concurrency: 1 })
  async handleStatusUpdate(
    job: Job<{
      disbursementId: string;
      groupUuid: string;
      startedAt: number;
    }>
  ): Promise<void> {
    const { disbursementId, groupUuid, startedAt } = job.data;

    this.logger.log(
      `Checking SDP disbursement status: ${disbursementId} for group ${groupUuid}`
    );

    try {
      const sdpClient = await this.getSdpClient();
      const disbursement = await sdpClient.disbursements.get(disbursementId);
      const status = disbursement.status?.toUpperCase();

      this.logger.log(
        `SDP disbursement ${disbursementId} status: ${status}`
      );

      if (status === 'COMPLETED') {
        const disbursementTimeTaken = Date.now() - startedAt;

        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'DISBURSED',
          isDisbursed: true,
          info: {
            disbursement,
            disbursementTimeTaken,
            completedAt: new Date().toISOString(),
          },
        });

        this.eventEmitter.emit(EVENTS.TOKEN_DISBURSED, { groupUuid });

        this.logger.log(
          `SDP disbursement completed for group ${groupUuid}`
        );
        return;
      }

      if (status === 'FAILED' || status === 'ERROR') {
        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'FAILED',
          isDisbursed: false,
          info: {
            disbursement,
            error: `SDP disbursement ${status}`,
            failedAt: new Date().toISOString(),
          },
        });

        this.logger.error(
          `SDP disbursement ${status} for group ${groupUuid}`
        );
        return;
      }

      // Still in progress — re-queue if within timeout
      const elapsed = Date.now() - startedAt;
      if (elapsed > STATUS_CHECK_TIMEOUT_MS) {
        this.logger.error(
          `SDP disbursement ${disbursementId} timed out after 24h for group ${groupUuid}`
        );

        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'FAILED',
          isDisbursed: false,
          info: {
            disbursement,
            error: 'Disbursement timed out after 24 hours',
            failedAt: new Date().toISOString(),
          },
        });
        return;
      }

      this.logger.log(
        `SDP disbursement ${disbursementId} still in progress, re-checking in ${STATUS_CHECK_DELAY_MS / 1000}s`
      );

      await this.stellarSdpQueue.add(
        JOBS.STELLAR_SDP.DISBURSEMENT_STATUS_UPDATE,
        { disbursementId, groupUuid, startedAt },
        {
          delay: STATUS_CHECK_DELAY_MS,
          attempts: 3,
          removeOnComplete: true,
          backoff: { type: 'exponential', delay: 5000 },
        }
      );
    } catch (error) {
      this.logger.error(
        `Error checking SDP disbursement status for ${disbursementId}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }
}

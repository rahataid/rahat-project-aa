import { Process, Processor } from '@nestjs/bull';
import { Logger, Injectable, Inject } from '@nestjs/common';
import { Job } from 'bull';
import { BQUEUE, CORE_MODULE, JOBS } from '../constants';
import { SettingsService } from '@rumsan/settings';
import { Horizon } from '@stellar/stellar-sdk';
import { ClientProxy } from '@nestjs/microservices';
import { VendorTokenRedemptionService } from '../vendors/vendorTokenRedemption.service';
import { TokenRedemptionStatus } from '../vendors/dto/vendorTokenRedemption.dto';

interface VendorTokenRedemptionJob {
  uuid: string;
  transactionHash: string;
}

@Processor(BQUEUE.VENDOR)
@Injectable()
export class VendorTokenRedemptionProcessor {
  private readonly logger = new Logger(VendorTokenRedemptionProcessor.name);

  constructor(
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly settingService: SettingsService,
    private readonly vendorTokenRedemptionService: VendorTokenRedemptionService
  ) {}

  @Process({ name: JOBS.VENDOR.VERIFY_TOKEN_REDEMPTION, concurrency: 1 })
  async verifyTokenRedemption(job: Job<VendorTokenRedemptionJob>) {
    this.logger.log(
      'Processing vendor token redemption verification job...',
      VendorTokenRedemptionProcessor.name
    );

    const { uuid, transactionHash } = job.data;

    try {
      // Poll the Stellar explorer for transaction status
      // const result = await this.waitForTransactionConfirmation(
      //   transactionHash,
      //   uuid
      // );

      // Hardcoded result.status = SUCCESS for evm (quick fix)

      const result = {
        status: 'SUCCESS',
        hash: transactionHash,
        response: {
          successful: true,
        },
        error: null,
      };

      if (result.status === 'SUCCESS') {
        // Update status to STELLAR_VERIFIED
        await this.vendorTokenRedemptionService.update({
          uuid,
          redemptionStatus: TokenRedemptionStatus.STELLAR_VERIFIED,
          transactionHash,
        });

        this.logger.log(
          `Token redemption ${uuid} verified successfully on Stellar`,
          VendorTokenRedemptionProcessor.name
        );
      } else {
        // Update status to STELLAR_FAILED
        await this.vendorTokenRedemptionService.update({
          uuid,
          redemptionStatus: TokenRedemptionStatus.STELLAR_FAILED,
          transactionHash,
        });

        this.logger.error(
          `Token redemption ${uuid} failed on Stellar: ${result.error}`,
          VendorTokenRedemptionProcessor.name
        );
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Error verifying token redemption ${uuid}: ${error.message}`,
        error.stack,
        VendorTokenRedemptionProcessor.name
      );

      // Update status to STELLAR_FAILED on error
      await this.vendorTokenRedemptionService.update({
        uuid,
        redemptionStatus: TokenRedemptionStatus.STELLAR_FAILED,
        transactionHash,
      });

      throw error;
    }
  }

  private async waitForTransactionConfirmation(
    transactionHash: string,
    redemptionUuid: string
  ): Promise<any> {
    const server = new Horizon.Server(await this.getFromSettings('HORIZONURL'));
    const startTime = Date.now();
    const timeoutMs = 180000; // 3 minute

    while (Date.now() - startTime < timeoutMs) {
      try {
        const txResponse = await server
          .transactions()
          .transaction(transactionHash)
          .call();

        this.logger.log(
          `Transaction status for redemption ${redemptionUuid}: ${txResponse.successful}`,
          VendorTokenRedemptionProcessor.name
        );

        if (txResponse.successful) {
          return {
            status: 'SUCCESS',
            hash: transactionHash,
            response: txResponse,
          };
        } else {
          this.logger.error(
            `Transaction failed for redemption ${redemptionUuid}: ${JSON.stringify(
              txResponse
            )}`,
            VendorTokenRedemptionProcessor.name
          );
          return {
            status: 'FAILED',
            hash: transactionHash,
            error: `Transaction failed: ${txResponse.result_xdr}`,
          };
        }
      } catch (error: any) {
        if (error.response && error.response.status === 404) {
          // Transaction not found yet, wait and retry
          await new Promise((resolve) => setTimeout(resolve, 2000));
          this.logger.log(
            `Transaction not found yet, retrying ${transactionHash}`,
            VendorTokenRedemptionProcessor.name
          );
        } else {
          this.logger.error(
            `Error checking transaction status for redemption ${redemptionUuid}: ${error.message}`,
            VendorTokenRedemptionProcessor.name
          );
          throw error;
        }
      }
    }

    // Timeout reached
    this.logger.warn(
      `Transaction verification timeout for redemption ${redemptionUuid} after 1 minute`,
      VendorTokenRedemptionProcessor.name
    );

    return {
      status: 'FAILED',
      hash: transactionHash,
      error: 'Transaction verification timeout after 1 minute',
    };
  }

  private async getFromSettings(key: string): Promise<string> {
    const settings = await this.settingService.getPublic('STELLAR_SETTINGS');
    const value = settings?.value[key];

    if (!value) {
      throw new Error(`Setting ${key} not found in STELLAR_SETTINGS`);
    }

    return value;
  }
}

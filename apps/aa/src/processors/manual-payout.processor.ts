import { Process, Processor } from '@nestjs/bull';
import { Logger, Injectable } from '@nestjs/common';
import { Job } from 'bull';
import { BQUEUE, JOBS } from '../constants';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { EnrichedManualPayoutRow } from '../payouts/dto/types';
import { PayoutsService } from '../payouts/payouts.service';
import { Prisma } from '@prisma/client';

@Processor(BQUEUE.MANUAL_PAYOUT)
@Injectable()
export class ManualPayoutProcessor {
  private readonly logger = new Logger(ManualPayoutProcessor.name);

  constructor(
    private readonly beneficiaryService: BeneficiaryService,
    private readonly payoutService: PayoutsService
  ) {}

  @Process({ name: JOBS.OFFRAMP.INSTANT_MANUAL_PAYOUT, concurrency: 1 })
  async sendInstantManualPayoutRequest(job: Job<{ payoutUUID: string }>) {
    const { payoutUUID } = job.data;

    const fspManualPayoutDetailsArray =
      await this.payoutService.getFSPManualPayoutDetails(payoutUUID);

    this.logger.log(
      `Processing instant manual payout request for ${fspManualPayoutDetailsArray.length} beneficiaries`
    );

    try {
      const payload: Prisma.BeneficiaryRedeemCreateManyInput[] =
        fspManualPayoutDetailsArray.map((fspManualPayoutDetails) => ({
          status: 'FIAT_TRANSACTION_INITIATED',
          transactionType: 'FIAT_TRANSFER',
          beneficiaryWalletAddress:
            fspManualPayoutDetails.beneficiaryWalletAddress,
          fspId: fspManualPayoutDetails.payoutProcessorId,
          amount: +fspManualPayoutDetails.amount,
          payoutId: fspManualPayoutDetails.payoutUUID,
          info: {
            paymentProviderType: 'manual_bank_transfer',
            beneficiaryWalletAddress:
              fspManualPayoutDetails.beneficiaryWalletAddress,
            beneficiaryBankDetails:
              fspManualPayoutDetails.beneficiaryBankDetails,
            beneficiaryPhoneNumber:
              fspManualPayoutDetails.beneficiaryPhoneNumber,
            numberOfAttempts: 1,
            message:
              'Manual bank transfer initiated - requires manual processing',
          },
        }));

      await this.beneficiaryService.createBeneficiaryRedeemBulk(payload);

      this.logger.log(
        `Successfully processed ${fspManualPayoutDetailsArray.length} manual payout requests`
      );

      return {
        success: true,
        message: `Processed ${fspManualPayoutDetailsArray.length} manual payout requests`,
      };
    } catch (error) {
      this.logger.error(
        `Instant manual payout failed: ${error.message}`,
        error.stack
      );
      throw new Error(`Failed to process instant manual payout: ${error.message}`);
    }
  }

  @Process({ name: JOBS.OFFRAMP.VERIFY_MANUAL_PAYOUT, concurrency: 1 })
  async verifyManualPayout(job: Job<EnrichedManualPayoutRow>) {
    const data = job.data;
    this.logger.log(`Verifying manual payout: ${JSON.stringify(data)}`);

    try {
      return data;
    } catch (error) {
      this.logger.error(
        `Failed to verify manual payout: ${error.message}`,
        error.stack
      );
      throw new Error(`Failed to verify manual payout: ${error.message}`);
    }
  }
}

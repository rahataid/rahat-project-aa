import { Process, Processor } from '@nestjs/bull';
import { Logger, Injectable } from '@nestjs/common';
import { Job } from 'bull';
import { BQUEUE, JOBS } from '../constants';
import { OfframpService } from '../payouts/offramp.service';
import { FSPManualPayoutDetails, FSPOfframpDetails } from './types';
import { getBankId } from '../utils/bank';
import { BeneficiaryRedeem, Prisma } from '@prisma/client';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { CipsResponseData } from '../payouts/dto/types';

@Processor(BQUEUE.OFFRAMP)
@Injectable()
export class OfframpProcessor {
  private readonly logger = new Logger(OfframpProcessor.name);
  constructor(
    private readonly offrampService: OfframpService,
    private readonly beneficiaryService: BeneficiaryService
  ) { }

  @Process({ name: JOBS.OFFRAMP.INSTANT_OFFRAMP, concurrency: 1 })
  async sendInstantOfframpRequest(job: Job<FSPOfframpDetails>) {
    const fspOfframpDetails = job.data;

    this.logger.log(
      `Processing offramp request of type ${fspOfframpDetails.offrampType} for amount: ${fspOfframpDetails.amount}, beneficiary wallet address: ${fspOfframpDetails.beneficiaryWalletAddress}`
    );

    const log = fspOfframpDetails.beneficiaryRedeemUUID
      ? await this.beneficiaryService.getBeneficiaryRedeem(
        fspOfframpDetails.beneficiaryRedeemUUID
      )
      : await this.beneficiaryService.createBeneficiaryRedeem({
        status: 'FIAT_TRANSACTION_INITIATED',
        transactionType: 'FIAT_TRANSFER',
        Beneficiary: {
          connect: {
            walletAddress: fspOfframpDetails.beneficiaryWalletAddress,
          },
        },
        fspId: fspOfframpDetails.payoutProcessorId,
        amount: +fspOfframpDetails.amount,
        txHash: fspOfframpDetails.transactionHash,
        payout: {
          connect: {
            uuid: fspOfframpDetails.payoutUUID,
          },
        },
        info: {
          transactionHash: fspOfframpDetails.transactionHash,
          offrampWalletAddress: fspOfframpDetails.offrampWalletAddress,
          offrampType: fspOfframpDetails.offrampType, // <--- It's a offramp process type like CIPS, VPA, etc.
          beneficiaryWalletAddress:
            fspOfframpDetails.beneficiaryWalletAddress,
          numberOfAttempts: job.attemptsMade + 1,
        },
      });

    const attemptsMade = ((log.info as any)?.numberOfAttempts || 0) + 1;

    if (log.isCompleted) {
      this.logger.log(
        `Beneficiary redeem is already completed for ${fspOfframpDetails.beneficiaryRedeemUUID}`
      );
      return;
    }

    // mark the beneficiary redeem as initiated
    if (log.status !== 'FIAT_TRANSACTION_INITIATED') {
      await this.beneficiaryService.updateBeneficiaryRedeem(log.uuid, {
        status: 'FIAT_TRANSACTION_INITIATED',
      });
    }

    try {
      if (!fspOfframpDetails.beneficiaryRedeemUUID) {
        await job.update({
          ...fspOfframpDetails,
          beneficiaryRedeemUUID: log.uuid,
        });
      }

      this.logger.log(
        `Initiating instant offramp with beneficiary bank details: ${JSON.stringify(
          fspOfframpDetails.beneficiaryBankDetails
        )}`
      );

      const offrampRequest = await this.generateOfframpPayload(
        fspOfframpDetails.offrampType,
        fspOfframpDetails
      );

      this.logger.log(
        `Offramp request payload: ${JSON.stringify(offrampRequest)}`
      );

      const result = await this.offrampService.instantOfframp(offrampRequest);

      if (result.offrampRequest.status === 'SUCCESS') {
        // update the transaction record
        await this.updateBeneficiaryRedeemAsCompleted({
          uuid: log.uuid,
          txHash: fspOfframpDetails.transactionHash,
          offrampWalletAddress: fspOfframpDetails.offrampWalletAddress,
          beneficiaryWalletAddress: fspOfframpDetails.beneficiaryWalletAddress,
          numberOfAttempts: attemptsMade,
          cipsResponseData: result,
        });

        return result;
      }

      console.log('Offramp request failed from cips', result);

      await this.updateBeneficiaryRedeemAsFailed(
        log.uuid,
        result.transaction.cipsBatchResponse.responseMessage ||
        'Offramp request failed from CIPS.',
        attemptsMade,
        log.info
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Instant offramp failed: ${error.message}`,
        error.stack
      );


      await this.updateBeneficiaryRedeemAsFailed(
        log.uuid,
        error.message,
        attemptsMade,
        log.info
      );

      throw error(`Failed to process instant offramp: ${error.message}`);
    }
  }

  @Process({ name: JOBS.OFFRAMP.INSTANT_MANUAL_PAYOUT, concurrency: 1 })
  async sendInstantManualPayoutRequest(job: Job<FSPManualPayoutDetails[]>) {
    const fspManualPayoutDetailsArray = job.data;

    this.logger.log(
      `Processing instant manual payout request for ${fspManualPayoutDetailsArray.length} beneficiaries`
    );

    try {
      const payload: Prisma.BeneficiaryRedeemCreateManyInput[] = fspManualPayoutDetailsArray.map((fspManualPayoutDetails) => ({
          status: 'FIAT_TRANSACTION_INITIATED',
          transactionType: 'FIAT_TRANSFER',
          beneficiaryWalletAddress: fspManualPayoutDetails.beneficiaryWalletAddress,
          fspId: fspManualPayoutDetails.payoutProcessorId,
          amount: +fspManualPayoutDetails.amount,
          payoutId: fspManualPayoutDetails.payoutUUID,
          info: {
            paymentProviderType: 'manual_bank_transfer',
            beneficiaryWalletAddress: fspManualPayoutDetails.beneficiaryWalletAddress,
            beneficiaryBankDetails: fspManualPayoutDetails.beneficiaryBankDetails,
            beneficiaryPhoneNumber: fspManualPayoutDetails.beneficiaryPhoneNumber,
            numberOfAttempts: 1,
            message: 'Manual bank transfer initiated - requires manual processing',
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
  async verifyManualPayout(job: Job<any>) {
    const data = job.data;
    console.log('data in verify manual payout', data);

    try {
      // match tranfer to benf 
      // mark benf as token redeemed and burn the token
      return data;
    } catch (error) {
      this.logger.error(`Failed to verify manual payout: ${error.message}`, error.stack);
      throw new Error(`Failed to verify manual payout: ${error.message}`);
    }
  }

  private async updateBeneficiaryRedeemAsFailed(
    uuid: string,
    error: string,
    numberOfAttempts?: number,
    info?: any
  ): Promise<BeneficiaryRedeem> {
    return await this.beneficiaryService.updateBeneficiaryRedeem(uuid, {
      status: 'FIAT_TRANSACTION_FAILED',
      isCompleted: false,
      info: {
        ...(info && { ...info }),
        error: error,
        ...(numberOfAttempts && { numberOfAttempts: numberOfAttempts }),
      },
    });
  }

  private async generateOfframpPayload(
    offrampType: string,
    fspOfframpDetails: FSPOfframpDetails
  ): Promise<any> {
    this.logger.log(
      `Generating offramp payload for ${offrampType} with details: ${JSON.stringify(
        fspOfframpDetails
      )}`
    );

    let offrampRequest: any = {
      tokenAmount: fspOfframpDetails.amount,
      paymentProviderId: fspOfframpDetails.payoutProcessorId,
      transactionHash: fspOfframpDetails.transactionHash,
      senderAddress: fspOfframpDetails.beneficiaryWalletAddress,
      xref: fspOfframpDetails.payoutUUID,
      paymentDetails: {
        creditorAgent: getBankId(
          fspOfframpDetails.beneficiaryBankDetails.bankName
        ),
        creditorAccount: fspOfframpDetails.beneficiaryBankDetails.accountNumber,
        creditorName: fspOfframpDetails.beneficiaryBankDetails.accountName,
      },
    };

    if (offrampType.toLocaleLowerCase() === 'vpa') {
      const trimmedPhoneNumber = fspOfframpDetails.beneficiaryPhoneNumber.startsWith('+977')
      ? fspOfframpDetails.beneficiaryPhoneNumber.slice(-10)
      : fspOfframpDetails.beneficiaryPhoneNumber;

      offrampRequest.paymentDetails = {
        vpa: trimmedPhoneNumber,
      };
    }

    return offrampRequest;
  }

  private async updateBeneficiaryRedeemAsCompleted({
    uuid,
    txHash,
    offrampWalletAddress,
    beneficiaryWalletAddress,
    numberOfAttempts,
    cipsResponseData,
  }: {
    uuid: string;
    txHash: string;
    offrampWalletAddress: string;
    beneficiaryWalletAddress: string;
    cipsResponseData: CipsResponseData;
    numberOfAttempts?: number;
  }): Promise<BeneficiaryRedeem> {
    return await this.beneficiaryService.updateBeneficiaryRedeem(uuid, {
      status: 'FIAT_TRANSACTION_COMPLETED',
      isCompleted: true,
      txHash: txHash,
      info: {
        message: 'Fiat transfer to offramp successful',
        transactionHash: txHash,
        offrampWalletAddress: offrampWalletAddress,
        beneficiaryWalletAddress: beneficiaryWalletAddress,
        cipsResponseData: JSON.parse(JSON.stringify(cipsResponseData)),
        ...(numberOfAttempts && { numberOfAttempts: numberOfAttempts }),
      },
    });
  }
}

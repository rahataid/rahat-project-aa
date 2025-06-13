import { Process, Processor } from '@nestjs/bull';
import { Logger, Injectable } from '@nestjs/common';
import { Job } from 'bull';
import { BQUEUE, JOBS } from '../constants';
import { SettingsService } from '@rumsan/settings';
import { OfframpService } from '../payouts/offramp.service';
import { FSPOfframpDetails } from './types';
import { getBankId } from '../utils/bank';
import { BeneficiaryRedeem } from '@prisma/client';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { CipsResponseData } from '../payouts/dto/types';

@Processor(BQUEUE.OFFRAMP)
@Injectable()
export class OfframpProcessor {
  private readonly logger = new Logger(OfframpProcessor.name);
  constructor(
    private readonly offrampService: OfframpService,
    private readonly beneficiaryService: BeneficiaryService
  ) {}

  @Process({ name: JOBS.OFFRAMP.INSTANT_OFFRAMP, concurrency: 1 })
  async sendInstantOfframpRequest(job: Job<FSPOfframpDetails>) {
    const fspOfframpDetails = job.data;

    this.logger.log(`Processing offramp request for amount: ${fspOfframpDetails.amount}, beneficiary wallet address: ${fspOfframpDetails.beneficiaryWalletAddress}`);

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
            }
          },
          info: {
            transactionHash: fspOfframpDetails.transactionHash,
            offrampWalletAddress: fspOfframpDetails.offrampWalletAddress,
            beneficiaryWalletAddress:
              fspOfframpDetails.beneficiaryWalletAddress,
            numberOfAttempts: 0,
          },
        });

    try {

      if(!fspOfframpDetails.beneficiaryRedeemUUID) {
        await job.update({
          ...fspOfframpDetails,
          beneficiaryRedeemUUID: log.uuid,
        })
      }

      this.logger.log(
        `Initiating instant offramp with beneficiary bank details: ${JSON.stringify(fspOfframpDetails.beneficiaryBankDetails)}`
      );

      // TODO: Need to think about fonepay and other payment providers
      const offrampRequest = {
        tokenAmount: fspOfframpDetails.amount,
        paymentProviderId: fspOfframpDetails.payoutProcessorId,
        transactionHash: fspOfframpDetails.transactionHash,
        senderAddress: fspOfframpDetails.beneficiaryWalletAddress,
        paymentDetails: {
          creditorAgent: Number(
            getBankId(fspOfframpDetails.beneficiaryBankDetails.bankName) // <-- TODO: This should be handled by the offramp itself in the future
          ),
          creditorAccount:
            fspOfframpDetails.beneficiaryBankDetails.accountNumber,
          creditorName: fspOfframpDetails.beneficiaryBankDetails.accountName,
        },
      };

      this.logger.log(`Offramp request payload: ${JSON.stringify(offrampRequest)}`);

      const result = await this.offrampService.instantOfframp(offrampRequest);

      // update the transaction record
      await this.updateBeneficiaryRedeemAsCompleted({
        uuid: log.uuid,
        txHash: fspOfframpDetails.transactionHash,
        offrampWalletAddress: fspOfframpDetails.offrampWalletAddress,
        beneficiaryWalletAddress: fspOfframpDetails.beneficiaryWalletAddress,
        numberOfAttempts: job.attemptsMade,
        cipsResponseData: result,
      });

      return result;
    } catch (error) {
      this.logger.error(
        `Instant offramp failed: ${error.message}`,
        error.stack,
      );

      await this.updateBeneficiaryRedeemAsFailed(
        log.uuid,
        error.message,
        job.attemptsMade
      );

      throw error(
        `Failed to process instant offramp: ${error.message}`
      );
    }
  }

  private async updateBeneficiaryRedeemAsFailed(
    uuid: string,
    error: string,
    numberOfAttempts?: number
  ): Promise<BeneficiaryRedeem> {
    return await this.beneficiaryService.updateBeneficiaryRedeem(uuid, {
      status: 'FIAT_TRANSACTION_FAILED',
      isCompleted: false,
      info: {
        error: error,
        ...(numberOfAttempts && { numberOfAttempts: numberOfAttempts }),
      },
    });
  }

  private async updateBeneficiaryRedeemAsCompleted({
    uuid,
    txHash,
    offrampWalletAddress,
    beneficiaryWalletAddress,
    numberOfAttempts,
    cipsResponseData
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

import { Process, Processor } from '@nestjs/bull';
import { Logger, Injectable } from '@nestjs/common';
import { Job } from 'bull';
import { BQUEUE, EVENTS, JOBS } from '../constants';
import { OfframpService } from '../payouts/offramp.service';
import { FSPOfframpDetails } from './types';
import { getBankId } from '../utils/bank';
import { BeneficiaryRedeem } from '@prisma/client';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { CipsResponseData } from '../payouts/dto/types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppService } from '../app/app.service';
import { ConfigService } from '@nestjs/config';

@Processor(BQUEUE.OFFRAMP)
@Injectable()
export class OfframpProcessor {
  private readonly logger = new Logger(OfframpProcessor.name);
  constructor(
    private readonly offrampService: OfframpService,
    private readonly beneficiaryService: BeneficiaryService,
    private readonly eventEmitter: EventEmitter2,
    private readonly appService: AppService,
    private configService: ConfigService
  ) {}

  @Process({ name: JOBS.OFFRAMP.INSTANT_OFFRAMP, concurrency: 1 })
  async sendInstantOfframpRequest(job: Job<FSPOfframpDetails>) {
    const fspOfframpDetails = job.data;
    const projectName = await this.appService.getSettings({
      name: 'PROJECTINFO',
    });
    const projectId = this.configService.get('PROJECT_ID');

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
        this.eventEmitter.emit(EVENTS.NOTIFICATION.CREATE, {
          payload: {
            title: `Fiat Transaction Completed`,
            description: `Fiat Transaction has been completed in ${
              projectName.value['project_name'] || process.env.PROJECT_ID
            }`,
            group: 'Payout',
            projectId: process.env.PROJECT_ID,
            notify: true,
          },
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
      this.eventEmitter.emit(EVENTS.NOTIFICATION.CREATE, {
        payload: {
          title: `Fiat Transaction Failed`,
          description: `Fiat Transaction has been failed in ${
            projectName.value['project_name'] || projectId
          }`,
          group: 'Payout',
          projectId: projectId,
          notify: true,
        },
      });
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
      if (job.attemptsMade === job.opts.attempts) {
        this.eventEmitter.emit(EVENTS.NOTIFICATION.CREATE, {
          payload: {
            title: `Fiat Transaction Failed`,
            description: `Fiat Transaction has been failed in ${
              projectName.value['project_name'] || process.env.PROJECT_ID
            }`,
            group: 'Payout',
            notify: true,
            projectId: process.env.PROJECT_ID,
          },
        });
      }
      throw error(`Failed to process instant offramp: ${error.message}`);
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
      const trimmedPhoneNumber =
        fspOfframpDetails.beneficiaryPhoneNumber.startsWith('+977')
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

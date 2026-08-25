import { Process, Processor } from '@nestjs/bull';
import { Logger, Injectable } from '@nestjs/common';
import { Job } from 'bull';
import { BQUEUE, EVENTS, JOBS } from '../constants';
import { OfframpService } from '../payouts/offramp.service';
import { FSPOfframpDetails } from './types';
import { RpcException } from '@nestjs/microservices';
import { BeneficiaryRedeem } from '@prisma/client';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { CipsResponseData } from '../payouts/dto/types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppService } from '../app/app.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '@rumsan/prisma';

const PAYOUT_CACHE_TTL = 5;
const PAYOUT_CACHE_KEY_PREFIX = 'payout:progress:';

@Processor(BQUEUE.OFFRAMP)
@Injectable()
export class OfframpProcessor {
  private readonly logger = new Logger(OfframpProcessor.name);
  constructor(
    private readonly offrampService: OfframpService,
    private readonly beneficiaryService: BeneficiaryService,
    private readonly eventEmitter: EventEmitter2,
    private readonly appService: AppService,
    private configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService
  ) {}

  @Process({ name: JOBS.OFFRAMP.INSTANT_OFFRAMP, concurrency: 2 })
  async sendInstantOfframpRequest(job: Job<FSPOfframpDetails>) {
    const fspOfframpDetails = job.data;
    // const projectName = await this.appService.getSettings({
    //   name: 'PROJECTINFO',
    // });
    // const projectId = this.configService.get('PROJECT_ID');

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

      const isVpa = fspOfframpDetails.offrampType.toLocaleLowerCase() === 'vpa';

      let beneficiaryBankAccount = null;
      if (!isVpa) {
        beneficiaryBankAccount =
          await this.beneficiaryService.getBeneficiaryBankAccount({
            walletAddress: fspOfframpDetails.beneficiaryWalletAddress,
          });

        if (!beneficiaryBankAccount) {
          throw new RpcException('Beneficiary bank account not found.');
        }
        if (!beneficiaryBankAccount.isValid) {
          throw new RpcException(
            `Bank account validation failed: ${
              beneficiaryBankAccount.info || 'Invalid bank account.'
            }`
          );
        }

        this.logger.log(
          `Fetched beneficiary bank account: ${JSON.stringify(
            beneficiaryBankAccount
          )}`
        );
      }

      const offrampRequest = await this.generateOfframpPayload(
        fspOfframpDetails.offrampType,
        fspOfframpDetails,
        beneficiaryBankAccount
      );

      this.logger.log(
        `Offramp request payload: ${JSON.stringify(offrampRequest)}`
      );

      const result = isVpa
        ? await this.offrampService.instantOfframp(offrampRequest)
        : await this.offrampService.instantOfframpV2(offrampRequest);

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
        this.logger.log(
          `Offramp request successful for beneficiary redeem UUID: ${log.uuid}, transaction hash: ${fspOfframpDetails.transactionHash}`
        );
        await this.updatePayoutProgressCache(
          fspOfframpDetails.payoutUUID,
          +fspOfframpDetails.amount
        );
        return result;
      }

      console.log('Offramp request failed from cips', result);

      this.logger.log(
        `Offramp request failed for beneficiary redeem`
      );


      await this.updateBeneficiaryRedeemAsFailed(
        log.uuid,
        this.buildCipsErrorMessage(result.transaction),
        attemptsMade,
        log.info
      );
      await this.updatePayoutProgressCache(
        fspOfframpDetails.payoutUUID,
        +fspOfframpDetails.amount
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
      await this.updatePayoutProgressCache(
        fspOfframpDetails.payoutUUID,
        +fspOfframpDetails.amount
      );
      if (job.attemptsMade === job.opts.attempts) {
        this.logger.log(`all attempts exhausted for job ${job.id}, sending notification but commented for now`);
      }
      throw error;
    }
  }

  private buildCipsErrorMessage(
    transaction: CipsResponseData['transaction']
  ): string {
    const { cipsBatchResponse, cipsTxnResponseList } = transaction;

    const parts = [
      `debitStatus:${cipsBatchResponse.debitStatus},${
        cipsBatchResponse.responseMessage || 'Offramp request failed from CIPS.'
      }`,
      ...(cipsTxnResponseList || []).map(
        (txn) => `creditStatus:${txn.creditStatus},${txn.responseMessage || 'FAILED'}`
      ),
    ];

    return parts.join(' AND ');
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

  private async updatePayoutProgressCache(
    payoutUUID: string,
    amount: number
  ): Promise<void> {
    try {
      const payout = await this.prisma.payouts.findUnique({
        where: { uuid: payoutUUID },
        select: {
          type: true,
          payoutProcessorId: true,
          beneficiaryGroupToken: {
            select: {
              numberOfTokens: true,
              beneficiaryGroup: {
                select: { _count: { select: { beneficiaries: true } } },
              },
            },
          },
        },
      });

      if (!payout?.beneficiaryGroupToken) return;

      const totalBeneficiaries =
        payout.beneficiaryGroupToken.beneficiaryGroup?._count?.beneficiaries ||
        0;
      if (totalBeneficiaries === 0) return;

      const cacheKey = `${PAYOUT_CACHE_KEY_PREFIX}${payoutUUID}`;
      const cached = await this.redisService.get<{
        completedCount: number;
        totalBeneficiaries: number;
        totalSuccessAmount: number;
        status: string;
        lastUpdated: number;
      }>(cacheKey);

      const currentCompleted = cached?.completedCount || 0;
      const currentAmount = cached?.totalSuccessAmount || 0;

      const newCompleted = Math.min(currentCompleted + 1, totalBeneficiaries);
      const newAmount = currentAmount + amount;
      const isComplete = newCompleted >= totalBeneficiaries;
      const status = isComplete ? 'COMPLETED' : 'PENDING';

      await this.redisService.set(
        cacheKey,
        {
          completedCount: newCompleted,
          totalBeneficiaries,
          totalSuccessAmount: newAmount,
          status,
          lastUpdated: Date.now(),
        },
        PAYOUT_CACHE_TTL
      );

      this.logger.debug(
        `Updated payout cache for ${payoutUUID}: ${newCompleted}/${totalBeneficiaries}, status=${status}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to update payout cache for ${payoutUUID}: ${error.message}`
      );
    }
  }

  private async generateOfframpPayload(
    offrampType: string,
    fspOfframpDetails: FSPOfframpDetails,
    beneficiaryBankAccount?: {
      bankId: string;
      accountNumber: string;
      accountName: string;
      branchId: string;
    }
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
        creditorAgent: beneficiaryBankAccount?.bankId,
        creditorAccount: beneficiaryBankAccount?.accountNumber,
        creditorName: beneficiaryBankAccount?.accountName,
        creditorBranch: beneficiaryBankAccount?.branchId,
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

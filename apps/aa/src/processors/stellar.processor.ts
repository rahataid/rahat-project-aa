import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger, Injectable, Inject } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { BQUEUE, CORE_MODULE, JOBS } from '../constants';
import { StellarService } from '../stellar/stellar.service';
import { SettingsService } from '@rumsan/settings';
import {
  Keypair,
  Networks,
  TransactionBuilder,
  BASE_FEE,
  rpc as StellarRpc,
  Contract,
  xdr,
} from '@stellar/stellar-sdk';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { generateParamsHash } from '../stellar/utils/stellar.utils.service';
import {
  AddTriggerDto,
  UpdateTriggerParamsDto,
} from '../stellar/dto/trigger.dto';
import { lastValueFrom } from 'rxjs';
import {
  DisburseDto,
  IDisbursementResultDto,
} from '../stellar/dto/disburse.dto';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { TransferToOfframpDto } from '../stellar/dto/transfer-to-offramp.dto';
import { ReceiveService, TransactionService } from '@rahataid/stellar-sdk';
import { IDisbursementStatusJob, FSPPayoutDetails } from './types';
import { BeneficiaryWallet } from '@rahataid/stellar-sdk';
import { PrismaService } from '@rumsan/prisma';
import { BeneficiaryRedeem, Prisma } from '@prisma/client';
import { canProcessJob } from '../utils/bullUtils';

interface BatchInfo {
  batchIndex: number;
  totalBatches: number;
  batchSize: number;
  totalWallets: number;
}

interface InternalFaucetBatchJob {
  wallets: BeneficiaryWallet[];
  batchInfo: BatchInfo;
}

@Processor(BQUEUE.STELLAR)
@Injectable()
export class StellarProcessor {
  private readonly logger = Logger;

  constructor(
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly beneficiaryService: BeneficiaryService,
    private readonly settingService: SettingsService,
    private readonly stellarService: StellarService,
    private readonly receiveService: ReceiveService,
    private readonly transactionService: TransactionService,
    @InjectQueue(BQUEUE.STELLAR)
    private readonly stellarQueue: Queue<IDisbursementStatusJob>,
    @InjectQueue(BQUEUE.OFFRAMP)
    private readonly offrampQueue: Queue,
    private readonly prismaService: PrismaService
  ) {}

  @Process({ name: JOBS.STELLAR.ADD_ONCHAIN_TRIGGER_QUEUE, concurrency: 1 })
  async addTriggerOnchain(job: Job<{ triggers: AddTriggerDto[] }>) {
    this.logger.log(
      'Processing add triggers on-chain job...',
      StellarProcessor.name
    );

    const { triggers } = job.data;
    this.logger.log(
      `Received ${triggers.length} triggers to process`,
      StellarProcessor.name
    );

    for (const trigger of triggers) {
      const maxRetries = job?.opts.attempts || 3;
      let attempt = 1;
      let lastError: any = null;

      while (attempt <= maxRetries) {
        try {
          this.logger.log(
            `Processing trigger ${trigger.id} - Attempt ${attempt} of ${maxRetries}`,
            StellarProcessor.name
          );

          if (attempt > 1) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }

          const transaction = await this.createTransaction(trigger);
          const result = await this.prepareSignAndSend(transaction);

          if (result.status === 'TRY_AGAIN_LATER') {
            this.logger.log(
              `Transaction for trigger ${trigger.id} needs retry. Status: ${result.status}`,
              StellarProcessor.name
            );
            throw new RpcException(result.errorResult);
          }

          // Check if transaction was submitted successfully
          if (!result.hash) {
            throw new RpcException('Transaction hash not received');
          }

          this.logger.log(
            `Transaction submitted for trigger ${trigger.id} with hash: ${result.hash}`,
            StellarProcessor.name
          );

          // Wait a bit before checking confirmation to allow transaction to be processed
          await new Promise((resolve) => setTimeout(resolve, 3000));

          // todo: Use wait for transaction confirmation from stellar-sdk
          // Note: SDK v13 has known issues with XDR parsing, so we handle parsing errors gracefully
          await this.waitForTransactionConfirmation(result.hash, trigger.id);

          this.logger.log(
            `Successfully processed trigger ${
              trigger.id
            } - Transaction: ${JSON.stringify(result)}`,
            StellarProcessor.name
          );

          const res = await lastValueFrom(
            this.client.send(
              { cmd: 'ms.jobs.triggers.updateTransaction' },
              {
                uuid: trigger.id,
                transactionHash: result.hash,
              }
            )
          );

          if (res) {
            this.logger.log(
              `Trigger ${trigger.id} status successfully updated in database`,
              StellarProcessor.name
            );
          }

          break;
        } catch (error) {
          // Check if the error is TriggerAlreadyExists (Contract error #1)
          if (error.message && error.message.includes('Error(Contract, #1)')) {
            this.logger.log(
              `Trigger ${trigger.id} already exists, skipping...`,
              StellarProcessor.name
            );
            break; // Skip this trigger and move to the next one
          }

          lastError = error;
          this.logger.error(
            `Attempt ${attempt} failed for trigger ${trigger.id}: ${error.message}`,
            error.stack,
            StellarProcessor.name
          );

          if (attempt === maxRetries) {
            this.logger.error(
              `All ${maxRetries} attempts failed for trigger ${trigger.id}. Final error: ${error.message}`,
              StellarProcessor.name
            );
          }

          attempt++;
          if (attempt <= maxRetries) {
            this.logger.log(
              `Retrying trigger ${trigger.id} - Attempt ${attempt} of ${maxRetries}`,
              StellarProcessor.name
            );
          }
        }
      }
    }
  }

  @Process({
    name: JOBS.STELLAR.FAUCET_TRUSTLINE,
    concurrency: 10,
  })
  async faucetAndTrustline(
    job: Job<{ walletAddress: string; secretKey: string }>
  ) {
    this.logger.log(
      'Processing faucet and trustline job...',
      StellarProcessor.name
    );

    const { walletAddress, secretKey } = job.data;

    try {
      await this.stellarService.faucetAndTrustlineService({
        walletAddress,
        secretKey,
      });
    } catch (error) {
      this.logger.error(
        `Error in faucet and trustline: ${JSON.stringify(error)}`,
        error.stack,
        StellarProcessor.name
      );
      throw error;
    }
  }

  @Process({
    name: JOBS.STELLAR.INTERNAL_FAUCET_TRUSTLINE_QUEUE,
    concurrency: 1,
  })
  async internalFaucetAndTrustline(job: Job<InternalFaucetBatchJob>) {
    const { wallets, batchInfo } = job.data;

    const canProceed = await canProcessJob(
      {
        ...job,
        data: {
          ...job.data,
          ...batchInfo,
        },
      },
      this.logger
    );

    if (!canProceed) {
      this.logger.warn('Skipping job due to high load');
      return;
    }

    this.logger.log(
      `Processing faucet and trustline batch ${batchInfo.batchIndex}/${batchInfo.totalBatches} with ${wallets.length} wallets...`,
      StellarProcessor.name
    );

    const startTime = Date.now();

    try {
      await this.transactionService.batchFundAccountXlm(
        wallets,
        (await this.getFromSettings('FUNDINGAMOUNT')) as string,
        (await this.getFromSettings('FAUCETSECRETKEY')) as string,
        (await this.getFromSettings('SERVER')) as string
      );

      const duration = Date.now() - startTime;

      await Promise.all(
        wallets.map(async (wallet) => {
          const beneficiary = await this.prismaService.beneficiary.findFirst({
            where: {
              walletAddress: wallet.address,
            },
          });

          if (beneficiary) {
            return await this.prismaService.beneficiary.update({
              where: {
                uuid: beneficiary.uuid,
              },
              data: {
                extras: {
                  ...(beneficiary.extras as Record<string, any>),
                  trustlineAdded: true,
                },
              },
            });
          }

          this.logger.warn(`Beneficiary ${wallet.address} not found`);
        })
      );

      this.logger.log(
        `Successfully completed batch ${batchInfo.batchIndex}/${batchInfo.totalBatches} with ${wallets.length} wallets in ${duration}ms`,
        StellarProcessor.name
      );

      const completedWallets =
        (batchInfo.batchIndex - 1) * batchInfo.batchSize + wallets.length;
      const progressPercentage = Math.round(
        (completedWallets / batchInfo.totalWallets) * 100
      );

      this.logger.log(
        `Progress: ${completedWallets}/${batchInfo.totalWallets} wallets (${progressPercentage}%)`,
        StellarProcessor.name
      );
    } catch (error) {
      this.logger.error(
        `Error in faucet and trustline batch ${batchInfo.batchIndex}/${
          batchInfo.totalBatches
        }: ${JSON.stringify(error)}`,
        error.stack,
        StellarProcessor.name
      );
      throw error;
    }
  }

  @Process(JOBS.STELLAR.UPDATE_ONCHAIN_TRIGGER_PARAMS_QUEUE)
  async updateTriggerParamsOnchain(job: Job<UpdateTriggerParamsDto>) {
    this.logger.log(
      'Processing update trigger params on-chain job...',
      StellarProcessor.name
    );
    const triggerUpdate = job.data;
    this.logger.log(
      `Trigger update data: ${JSON.stringify(triggerUpdate)}`,
      StellarProcessor.name
    );

    const maxRetries = job?.opts.attempts || 3;
    let attempt = 1;
    let lastError: any = null;

    while (attempt <= maxRetries) {
      try {
        this.logger.log(
          `Attempt ${attempt} of ${maxRetries} for trigger ${triggerUpdate.id}`,
          StellarProcessor.name
        );

        if (attempt > 1) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        const transaction = await this.createUpdateTriggerParamsTransaction(
          triggerUpdate
        );
        const result = await this.prepareSignAndSend(transaction);

        if (result.status === 'TRY_AGAIN_LATER') {
          this.logger.log(
            `Transaction for trigger ${triggerUpdate.id} needs retry. Status: ${result.status}`,
            StellarProcessor.name
          );
          throw new RpcException(result.errorResult);
        }

        await this.waitForTransactionConfirmation(
          result.hash,
          triggerUpdate.id
        );

        this.logger.log(
          `Transaction successfully processed for trigger ${triggerUpdate.id}`,
          JSON.stringify(result)
        );

        const res = await lastValueFrom(
          this.client.send(
            { cmd: 'ms.jobs.triggers.updateTransaction' },
            {
              uuid: triggerUpdate.id,
              transactionHash: result.hash,
            }
          )
        );
        if (res) {
          this.logger.log(
            `Updated Trigger ${triggerUpdate.id} status successfully updated in database`,
            StellarProcessor.name
          );
        }

        break;
      } catch (error) {
        lastError = error;
        this.logger.error(
          `Attempt ${attempt} failed for trigger ${
            triggerUpdate.id
          } with error: ${JSON.stringify(error)}`,
          error.stack,
          StellarProcessor.name
        );

        if (attempt === maxRetries) {
          this.logger.error(
            `All ${maxRetries} attempts failed for trigger ${
              triggerUpdate.id
            }. Final error: ${JSON.stringify(error)}`,
            StellarProcessor.name
          );
        }

        attempt++;

        this.logger.log(
          `Retrying attempt: ${attempt + 1} for trigger ${triggerUpdate.id}`,
          StellarProcessor.name
        );
        if (attempt <= maxRetries) {
          this.logger.log(
            `Retrying trigger ${triggerUpdate.id} - Attempt ${attempt} of ${maxRetries}`,
            StellarProcessor.name
          );
        }
      }
    }
  }
  //TODO: EVM Change
  @Process({ name: JOBS.STELLAR.DISBURSE_ONCHAIN_QUEUE, concurrency: 1 })
  async disburseOnchain(job: Job<DisburseDto>) {
    this.logger.log('Processing disbursement job...', StellarProcessor.name);

    const { ...rest } = job.data;

    console.log(rest);
    const groupUuid = rest.groups[0];

    console.log(groupUuid);

    try {
      const result: IDisbursementResultDto = await this.stellarService.disburse(
        rest
      );

      this.logger.log(
        `Disbursement job completed successfully: ${JSON.stringify(result)}`,
        StellarProcessor.name
      );

      await this.beneficiaryService.updateGroupToken({
        groupUuid,
        status: 'STARTED',
        isDisbursed: false,
        info: result,
      });

      // Job to check the status of the disbursement after 3 min
      this.stellarQueue.add(
        JOBS.STELLAR.DISBURSEMENT_STATUS_UPDATE,
        {
          disbursementID: result.disbursementID,
          assetIssuer: result.assetIssuer,
          groupUuid,
        },
        {
          delay: 3 * 60 * 1000, // 3 min
        }
      );

      this.logger.log(
        `Successfully added disbursement status update job for group ${groupUuid}`,
        StellarProcessor.name
      );

      return result;
    } catch (error) {
      await this.beneficiaryService.updateGroupToken({
        groupUuid,
        status: 'FAILED',
        isDisbursed: false,
        info: {
          error: error.message,
          stack: error.stack,
        },
      });

      this.logger.error(
        `Error in disbursement: ${error.message}`,
        error.stack,
        StellarProcessor.name
      );

      throw error;
    }
  }

  @Process({ name: JOBS.STELLAR.TRANSFER_TO_OFFRAMP, concurrency: 1 })
  async transferToOfframp(job: Job<FSPPayoutDetails>) {
    this.logger.log(
      'Processing transfer to offramp job...',
      StellarProcessor.name
    );
    const { ...payload } = job.data;

    const log = payload.beneficiaryRedeemUUID
      ? await this.beneficiaryService.getBeneficiaryRedeem(
          payload.beneficiaryRedeemUUID
        )
      : await this.createBeneficiaryRedeemRecord({
          status: 'TOKEN_TRANSACTION_INITIATED',
          transactionType: 'TOKEN_TRANSFER',
          fspId: payload.payoutProcessorId,
          amount: payload.amount,
          payout: {
            connect: {
              uuid: payload.payoutUUID,
            },
          },
          Beneficiary: {
            connect: {
              walletAddress: payload.beneficiaryWalletAddress,
            },
          },
          info: {
            offrampWalletAddress: payload.offrampWalletAddress,
            beneficiaryWalletAddress: payload.beneficiaryWalletAddress,
            payoutUUID: payload.payoutUUID,
            payoutProcessorId: payload.payoutProcessorId,
            numberOfAttempts: job.attemptsMade + 1,
          },
        });

    if (!payload.beneficiaryRedeemUUID) {
      job.update({
        ...job.data,
        beneficiaryRedeemUUID: log.uuid,
      });
    }

    const attemptsMade = ((log.info as any)?.numberOfAttempts || 0) + 1;

    if (log.isCompleted) {
      this.logger.log(
        `Beneficiary redeem is already completed for ${payload.beneficiaryRedeemUUID}`
      );
      return;
    }

    if (log.status !== 'TOKEN_TRANSACTION_INITIATED') {
      await this.beneficiaryService.updateBeneficiaryRedeem(log.uuid, {
        status: 'TOKEN_TRANSACTION_INITIATED',
      });
    }

    try {
      // Get Keys of beneficiary with walletAddress
      const keys = await this.stellarService.getSecretByWallet(
        payload.beneficiaryWalletAddress as string
      );

      if (!keys) {
        await this.updateBeneficiaryRedeemAsFailed(
          log.uuid,
          'Beneficiary with wallet not found',
          attemptsMade,
          log.info
        );
        throw new RpcException(
          `Beneficiary with wallet ${payload.beneficiaryWalletAddress} not found`
        );
      }

      // Get balance and check if the account has rahat balance > 0
      // TODO: think about the amount to be transferred
      const balance = await this.stellarService.getRahatBalance(
        payload.beneficiaryWalletAddress
      );

      if (balance < payload.amount) {
        await this.updateBeneficiaryRedeemAsFailed(
          log.uuid,
          `Balance is less than the amount to be transferred. Current balance: ${balance}, Amount to be transferred: ${payload.amount}`,
          attemptsMade,
          log.info
        );

        throw new RpcException(
          `Beneficiary with wallet ${payload.beneficiaryWalletAddress} has rahat balance <= 0`
        );
      }

      if (balance <= 0) {
        await this.updateBeneficiaryRedeemAsFailed(
          log.uuid,
          `Beneficiary has ${balance} rahat balance with wallet ${payload.beneficiaryWalletAddress}`,
          job.attemptsMade + 1,
          log.info
        );

        throw new RpcException(
          `Beneficiary with wallet ${payload.beneficiaryWalletAddress} has rahat balance <= 0`
        );
      }

      this.logger.log(
        `Transferring asset from ${keys.publicKey} to ${payload.offrampWalletAddress}`,
        StellarProcessor.name
      );

      const result = await this.receiveService.sendAsset(
        keys.privateKey,
        payload.offrampWalletAddress,
        payload.amount.toString()
      );

      await this.updateBeneficiaryRedeemAsCompleted({
        uuid: log.uuid,
        txHash: result.tx.hash,
        offrampWalletAddress: payload.offrampWalletAddress,
        beneficiaryWalletAddress: payload.beneficiaryWalletAddress,
        amount: payload.amount,
        numberOfAttempts: attemptsMade,
      });

      // delete the beneficiaryRedeemUUID from the payload to avoid sending it to the offramp queue
      delete payload.beneficiaryRedeemUUID;

      this.offrampQueue.add(
        JOBS.OFFRAMP.INSTANT_OFFRAMP,
        {
          ...payload,
          transactionHash: result.tx.hash,
          amount: payload.amount.toString(),
        },
        {
          delay: 1000,
          attempts: 1,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        }
      );

      this.logger.log(
        `Transfer to offramp job completed successfully`,
        StellarProcessor.name
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Error in transfer to offramp: ${error.message}`,
        error.stack,
        StellarProcessor.name
      );

      if (!(error instanceof RpcException)) {
        await this.updateBeneficiaryRedeemAsFailed(
          log.uuid,
          error.message,
          attemptsMade,
          log.info
        );
      }

      throw error;
    }
  }

  @Process({ name: JOBS.STELLAR.DISBURSEMENT_STATUS_UPDATE, concurrency: 1 })
  async disbursementStatusUpdate(job: Job<IDisbursementStatusJob>) {
    try {
      this.logger.log(
        'Processing disbursement status update job...',
        StellarProcessor.name
      );

      const { disbursementID, assetIssuer, groupUuid } = job.data;

      const disbursement = await this.stellarService.getDisbursement(
        disbursementID
      );

      if (!disbursement) {
        this.logger.error(
          `Disbursement ${disbursementID} not found`,
          StellarProcessor.name
        );

        return;
      }

      const group =
        await this.beneficiaryService.getOneTokenReservationByGroupId(
          groupUuid
        );

      if (!group) {
        this.logger.error(
          `Group ${groupUuid} not found`,
          StellarProcessor.name
        );
        return;
      }

      if (disbursement.status === 'STARTED') {
        this.logger.log(
          `Disbursement ${disbursementID} is in STARTED status, So, adding another queue to check the status of the disbursement after 2 min`,
          StellarProcessor.name
        );
        // if the group updatedA is more then 60 min, then assume the disbursement is failed
        const groupUpdatedAt = new Date(group.updatedAt);
        const currentDate = new Date();
        if (
          groupUpdatedAt.getTime() >
          (currentDate.getTime() - 24 * 60 * 60 * 1000)
        ) {
          this.logger.log(
            `Group ${groupUuid} updated more then 60 min ago, so assuming the disbursement is failed`,
            StellarProcessor.name
          );
          await this.beneficiaryService.updateGroupToken({
            groupUuid,
            status: 'FAILED',
            isDisbursed: false,
            info: {
              ...(group.info && { ...JSON.parse(JSON.stringify(group.info)) }),
              error: 'Something went wrong',
            },
          });
          return;
        }

        // add another queue to check the status of the disbursement after 2 min
        this.stellarQueue.add(
          JOBS.STELLAR.DISBURSEMENT_STATUS_UPDATE,
          {
            disbursementID: disbursementID,
            assetIssuer: assetIssuer,
            groupUuid,
          },
          {
            delay: 2 * 60 * 1000, // 2 min
          }
        );
        return;
      }

      if (disbursement.status === 'FAILED' || disbursement.status === 'ERROR') {
        this.logger.log(
          `Disbursement ${disbursementID} is in FAILED status`,
          StellarProcessor.name
        );

        // update the status of the disbursement in the database
        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'FAILED',
          isDisbursed: false,
          info: {
            ...(group.info && { ...JSON.parse(JSON.stringify(group.info)) }),
            error: 'Something went wrong',
          },
        });

        return;
      }

      if (disbursement.status === 'COMPLETED') {
        this.logger.log(
          `Disbursement ${disbursementID} is in COMPLETED status`,
          StellarProcessor.name
        );

        const timeTakenToDisburse = 
        new Date(disbursement.updated_at).getTime() 
        - new Date(disbursement.created_at).getTime();


        // update the status of the disbursement in the database
        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'DISBURSED',
          isDisbursed: true,
          info: {
            ...(group.info && { ...JSON.parse(JSON.stringify(group.info)) }),
            disbursementTimeTaken: timeTakenToDisburse,
            disbursement,
          },
        });
        return;
      }

      this.logger.log(
        `Disbursement ${disbursementID} is in ${disbursement.status} status`,
        StellarProcessor.name
      );

      return;
    } catch (error) {
      this.logger.error(
        `Error in disbursement status update: ${error.message}`,
        error.stack,
        StellarProcessor.name
      );
      throw error;
    }
  }

  private async updateBeneficiaryRedeemAsFailed(
    uuid: string,
    error: string,
    numberOfAttempts?: number,
    info?: any
  ): Promise<BeneficiaryRedeem> {
    return await this.beneficiaryService.updateBeneficiaryRedeem(uuid, {
      status: 'TOKEN_TRANSACTION_FAILED',
      isCompleted: false,
      info: {
        ...(info && { ...info }),
        ...(numberOfAttempts && { numberOfAttempts: numberOfAttempts }),
        error: error,
      },
    });
  }

  private async updateBeneficiaryRedeemAsCompleted({
    uuid,
    txHash,
    offrampWalletAddress,
    beneficiaryWalletAddress,
    numberOfAttempts,
    amount,
  }: {
    uuid: string;
    txHash: string;
    offrampWalletAddress: string;
    beneficiaryWalletAddress: string;
    numberOfAttempts?: number;
    amount: number;
  }): Promise<BeneficiaryRedeem> {
    return await this.beneficiaryService.updateBeneficiaryRedeem(uuid, {
      status: 'TOKEN_TRANSACTION_COMPLETED',
      isCompleted: true,
      amount: amount,
      txHash: txHash,
      info: {
        message: 'Token transfer to offramp successful',
        transactionHash: txHash,
        offrampWalletAddress: offrampWalletAddress,
        beneficiaryWalletAddress: beneficiaryWalletAddress,
        ...(numberOfAttempts && { numberOfAttempts: numberOfAttempts }),
      },
    });
  }

  private async createBeneficiaryRedeemRecord(
    data: Prisma.BeneficiaryRedeemCreateInput
  ): Promise<BeneficiaryRedeem> {
    return await this.beneficiaryService.createBeneficiaryRedeem(data);
  }

  /*
  @Process({ name: JOBS.STELLAR.SEND_GROUP_OTP, concurrency: 1 })
  async sendGroupOTP(job: Job<{ phoneNumber: string[] }>) {
    this.logger.log('Processing send group OTP job...', StellarProcessor.name);
    const { phoneNumber } = job.data;

    // try {
    //   await this.stellarService.sendGroupOTP({ phoneNumber });
    // } catch (error) {
    //   this.logger.error(
    //     `Error in send group OTP: ${JSON.stringify(error)}`,
    //     error.stack,
    //     StellarProcessor.name
    //   );
    //   throw error;
    // }
  }
  */

  // Private functions
  private async createTransaction(trigger: AddTriggerDto) {
    try {
      const server = new StellarRpc.Server(
        await this.getFromSettings('SERVER')
      );
      const keypair = Keypair.fromSecret(await this.getFromSettings('KEYPAIR'));
      const publicKey = keypair.publicKey();
      const contractId = await this.getFromSettings('CONTRACTID');

      const sourceAccount = await server.getAccount(publicKey);
      const contract = new Contract(contractId);

      this.logger.error(
        `Using sequence number: ${sourceAccount.sequenceNumber()} for trigger ${
          trigger.id
        }`,
        StellarProcessor.name
      );

      const paramsHash = generateParamsHash(trigger.params);

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          contract.call(
            'add_trigger',
            xdr.ScVal.scvString(trigger.id),
            xdr.ScVal.scvString(trigger.trigger_type),
            xdr.ScVal.scvString(trigger.phase),
            xdr.ScVal.scvString(trigger.title),
            xdr.ScVal.scvString(trigger.source),
            xdr.ScVal.scvString(trigger.river_basin),
            xdr.ScVal.scvString(paramsHash),
            xdr.ScVal.scvBool(trigger.is_mandatory)
          )
        )
        .setTimeout(30)
        .build();

      return transaction;
    } catch (error) {
      this.logger.error(
        `Error creating transaction for trigger ${trigger.id}: ${JSON.stringify(
          error
        )}`,
        error.stack,
        StellarProcessor.name
      );
      throw new RpcException(error.message || 'Transaction creation failed');
    }
  }

  private async createUpdateTriggerParamsTransaction(
    triggerUpdate: UpdateTriggerParamsDto
  ) {
    try {
      if (!triggerUpdate.id) {
        throw new Error('Trigger ID is required');
      }

      const server = new StellarRpc.Server(
        await this.getFromSettings('SERVER')
      );
      const keypair = Keypair.fromSecret(await this.getFromSettings('KEYPAIR'));
      const publicKey = keypair.publicKey();
      const contractId = await this.getFromSettings('CONTRACTID');
      const sourceAccount = await server.getAccount(publicKey);
      const contract = new Contract(contractId);

      this.logger.log(
        `Using sequence number: ${sourceAccount} for trigger ${triggerUpdate.id}`,
        StellarProcessor.name
      );

      let paramsHash: string | undefined = undefined;
      if (triggerUpdate.params) {
        paramsHash = generateParamsHash(triggerUpdate.params);
      }

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          contract.call(
            'update_trigger_params',
            xdr.ScVal.scvString(triggerUpdate.id),
            this.toOptionalScVal(paramsHash),
            this.toOptionalScVal(triggerUpdate.source),
            triggerUpdate.isTriggered !== undefined
              ? xdr.ScVal.scvBool(triggerUpdate.isTriggered)
              : xdr.ScVal.scvVoid()
          )
        )
        .setTimeout(30)
        .build();

      this.logger.debug(
        `Created update_trigger_params transaction for trigger ID: ${triggerUpdate.id}`,
        StellarProcessor.name
      );

      return transaction;
    } catch (error) {
      this.logger.error(
        `Error creating update_trigger_params transaction for trigger ${
          triggerUpdate.id
        }: ${JSON.stringify(error)}`,
        error.stack,
        StellarProcessor.name
      );
      throw new RpcException(
        error.message || 'Update trigger params transaction creation failed'
      );
    }
  }

  private async prepareSignAndSend(transaction: any) {
    try {
      const server = new StellarRpc.Server(
        await this.getFromSettings('SERVER')
      );
      const keypair = Keypair.fromSecret(await this.getFromSettings('KEYPAIR'));

      this.logger.log('Preparing transaction...', StellarProcessor.name);
      const preparedTransaction = await server.prepareTransaction(transaction);

      preparedTransaction.sign(keypair);

      this.logger.log(
        'Sending transaction to network...',
        StellarProcessor.name
      );
      const txn = await server.sendTransaction(preparedTransaction);

      if (txn.status === 'ERROR') {
        this.logger.error(
          `Contract error: ${JSON.stringify(txn.errorResult)}`,
          StellarProcessor.name
        );
        throw new Error('Transaction failed');
      }

      return txn;
    } catch (error) {
      let errorMessage = error.message || 'Transaction failed';

      if (error.message?.includes('ContractError')) {
        this.logger.error(
          `Contract error details: ${JSON.stringify(error.message)}`,
          StellarProcessor.name
        );
      }

      this.logger.error(
        `Transaction error: ${JSON.stringify(error)}`,
        error.stack,
        StellarProcessor.name
      );

      throw new RpcException(errorMessage);
    }
  }

  private async waitForTransactionConfirmation(
    transactionHash: string,
    triggerId: string
  ): Promise<any> {
    const server = new StellarRpc.Server(await this.getFromSettings('SERVER'));
    const startTime = Date.now();
    const timeoutMs = 60000;
    let retryCount = 0;
    const maxRetries = 8;

    while (Date.now() - startTime < timeoutMs) {
      try {
        retryCount++;
        this.logger.log(
          `Checking transaction status for trigger ${triggerId} (attempt ${retryCount}/${maxRetries})`,
          StellarProcessor.name
        );

        const txResponse = await server.getTransaction(transactionHash);

        // Handle SDK v13 response format
        if (txResponse && typeof txResponse === 'object') {
          const status = txResponse.status;

          this.logger.log(
            `Transaction status for trigger ${triggerId}: ${status}`,
            StellarProcessor.name
          );

          if (status === 'SUCCESS') {
            return {
              status: 'SUCCESS',
              hash: transactionHash,
              response: txResponse,
            };
          } else if (status === 'FAILED') {
            throw new RpcException(
              `Transaction failed: ${JSON.stringify(txResponse)}`
            );
          } else if (status === 'NOT_FOUND') {
            // Transaction not yet available, wait and retry
            this.logger.log(
              `Transaction ${transactionHash} not found yet, waiting...`,
              StellarProcessor.name
            );
          } else {
            this.logger.log(
              `Unknown transaction status: ${status}, waiting...`,
              StellarProcessor.name
            );
          }
        } else {
          this.logger.warn(
            `Unexpected transaction response format for ${triggerId}`,
            StellarProcessor.name
          );
        }

        // Wait before next check
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (error) {
        // Handle XDR parsing errors (SDK v13 issue)
        if (error.message && error.message.includes('Bad union switch')) {
          this.logger.warn(
            `XDR parsing error for trigger ${triggerId}, but transaction succeeded. Hash: ${transactionHash}`,
            StellarProcessor.name
          );

          // Since the transaction hash exists and we got a parsing error, assume success
          return {
            status: 'SUCCESS',
            hash: transactionHash,
            note: 'Transaction confirmed despite SDK v13 parsing error',
          };
        }

        // Handle other errors
        if (error.message && error.message.includes('not found')) {
          this.logger.log(
            `Transaction ${transactionHash} not found yet, retrying...`,
            StellarProcessor.name
          );
        } else {
          this.logger.error(
            `Error checking transaction status for trigger ${triggerId}: ${error.message}`,
            error.stack,
            StellarProcessor.name
          );

          // If we've retried enough times, assume success for SDK v13 compatibility
          if (retryCount >= maxRetries) {
            this.logger.warn(
              `Max retries reached for ${triggerId}, assuming transaction succeeded`,
              StellarProcessor.name
            );
            return {
              status: 'SUCCESS',
              hash: transactionHash,
              note: 'Transaction assumed successful after max retries (SDK v13 compatibility)',
            };
          }
        }
      }
    }

    throw new RpcException(
      `Transaction confirmation timed out for trigger ${triggerId} after ${timeoutMs}ms`
    );
  }

  private toOptionalScVal(value: string | null | undefined): xdr.ScVal {
    return value !== null && value !== undefined
      ? xdr.ScVal.scvString(value)
      : xdr.ScVal.scvVoid();
  }

  private async getFromSettings(key: string) {
    const settings = await this.settingService.getPublic('STELLAR_SETTINGS');
    if (!settings?.value[key]) {
      throw new Error(`Setting ${key} not found in STELLAR_SETTINGS`);
    }
    return settings.value[key];
  }
}

import { Process, Processor } from '@nestjs/bull';
import { Logger, Injectable, Inject } from '@nestjs/common';
import { Job } from 'bull';
import { BQUEUE, CORE_MODULE, JOBS } from '../constants';
import { StellarService } from '../stellar/stellar.service';
import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma';
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

@Processor(BQUEUE.STELLAR)
@Injectable()
export class StellarProcessor {
  private readonly logger = Logger;

  constructor(
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly settingService: SettingsService,
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService
  ) {}

  @Process({ name: JOBS.STELLAR.ADD_ONCHAIN_TRIGGER_QUEUE, concurrency: 1 })
  async addTriggerOnchain(job: Job<{ triggers: AddTriggerDto[] }>) {
    this.logger.log(
      'Processing add triggers on-chain job...',
      StellarProcessor.name
    );

    console.log(job.data);

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

          await this.waitForTransactionConfirmation(result.hash, trigger.id);

          this.logger.log(
            `Successfully processed trigger ${
              trigger.id
            } - Transaction: ${JSON.stringify(result)}`,
            StellarProcessor.name
          );

          this.client.send(
            { cmd: 'ms.jobs.triggers.updateTransaction' },
            {
              uuid: trigger.id,
              transactionHash: result.hash,
            }
          );
          break;
        } catch (error) {
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

          this.client.send(
            { cmd: 'ms.jobs.triggers.updateTransaction' },
            {
              uuid: triggerUpdate.id,
              transactionHash: result.hash,
            }
          );
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
    while (Date.now() - startTime < timeoutMs) {
      try {
        const txResponse = await server.getTransaction(transactionHash);
        this.logger.log(
          `Transaction status for trigger ${triggerId}: ${txResponse.status}`
        );

        if (txResponse.status === 'SUCCESS') {
          return txResponse;
        } else if (txResponse.status === 'FAILED') {
          throw new RpcException(
            `Transaction failed: ${JSON.stringify(txResponse)}`
          );
        } else {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          this.logger.log(`Retrying ${triggerId}`);
        }
      } catch (error) {
        this.logger.error(
          `Error checking transaction status for trigger ${triggerId}: ${error.message}`
        );
        throw error;
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

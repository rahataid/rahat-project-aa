import { Process, Processor } from '@nestjs/bull';
import { Logger, Inject, Injectable } from '@nestjs/common';
import { Job } from 'bull';
import { BQUEUE, JOBS } from '../constants';
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
import { RpcException } from '@nestjs/microservices';
import { generateParamsHash } from '../stellar/utils/stellar.utils.service';
import {
  AddTriggerDto,
  UpdateTriggerParamsDto,
} from '../stellar/dto/trigger.dto';

@Processor(BQUEUE.STELLAR)
@Injectable()
export class StellarProcessor {
  private readonly logger = Logger;

  constructor(
    private readonly settingService: SettingsService,
    private readonly prisma: PrismaService
  ) {}

  @Process(JOBS.STELLAR.ADD_ONCHAIN_TRIGGER_QUEUE)
  async addTriggerOnchain(job: Job<AddTriggerDto>) {
    this.logger.log(
      'Processing add trigger on-chain job...',
      StellarProcessor.name
    );
    const trigger = job.data;
    this.logger.log(
      `Trigger data: ${JSON.stringify(trigger)}`,
      StellarProcessor.name
    );

    const maxRetries = job?.opts.attempts || 3;
    let attempt = 1;

    while (attempt <= maxRetries) {
      try {
        this.logger.log(
          `Attempt ${attempt} of ${maxRetries}`,
          StellarProcessor.name
        );
        const transaction = await this.createTransaction(trigger);
        const result = await this.prepareSignAndSend(transaction);
        this.logger.log(
          'Transaction successfully processed',
          StellarProcessor.name
        );
        return result;
      } catch (error) {
        this.logger.error(
          `Attempt ${attempt} failed: ${error.message}`,
          error.stack,
          StellarProcessor.name
        );

        if (attempt === maxRetries) {
          this.logger.error(
            `All ${maxRetries} attempts failed for trigger ${trigger.id}`,
            StellarProcessor.name
          );
          throw new RpcException(
            error instanceof Error
              ? error.message
              : 'Failed to process trigger after retries'
          );
        }

        this.logger.log(
          `Retrying attempt: ${attempt + 1}`,
          StellarProcessor.name
        );
        attempt++;
      }
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

    while (attempt <= maxRetries) {
      try {
        this.logger.log(
          `Attempt ${attempt} of ${maxRetries}`,
          StellarProcessor.name
        );
        const transaction = await this.createUpdateTriggerParamsTransaction(
          triggerUpdate
        );
        const result = await this.prepareSignAndSend(transaction);
        this.logger.log(
          'Transaction successfully processed',
          StellarProcessor.name
        );
        return result;
      } catch (error) {
        this.logger.error(
          `Attempt ${attempt} failed: ${error.message}`,
          error.stack,
          StellarProcessor.name
        );

        if (attempt === maxRetries) {
          this.logger.error(
            `All ${maxRetries} attempts failed for trigger ${triggerUpdate.id}`,
            StellarProcessor.name
          );
          throw new RpcException(
            error instanceof Error
              ? error.message
              : 'Failed to process trigger params update after retries'
          );
        }

        this.logger.log(
          `Retrying attempt: ${attempt + 1}`,
          StellarProcessor.name
        );
        attempt++;
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
      const sourceAccount = await server.getAccount(publicKey);
      const CONTRACT_ID = await this.getFromSettings('CONTRACTID');

      const paramsHash = generateParamsHash(trigger.params);

      const contract = new Contract(CONTRACT_ID);
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          contract.call(
            'add_trigger',
            xdr.ScVal.scvSymbol(trigger.id),
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
        `Error creating transaction: ${error.message}`,
        error.stack,
        StellarProcessor.name
      );
      throw new RpcException(
        error instanceof Error ? error.message : 'Transaction creation failed'
      );
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
      const sourceAccount = await server.getAccount(publicKey);
      const CONTRACT_ID = await this.getFromSettings('CONTRACTID');

      let paramsHash: string | undefined = undefined;
      if (triggerUpdate.params) {
        paramsHash = generateParamsHash(triggerUpdate.params);
      }

      const contract = new Contract(CONTRACT_ID);
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          contract.call(
            'update_trigger_params',
            xdr.ScVal.scvSymbol(triggerUpdate.id),
            this.toOptionalScVal(paramsHash),
            this.toOptionalScVal(triggerUpdate.source)
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
        `Error creating update_trigger_params transaction: ${error.message}`,
        error.stack,
        StellarProcessor.name
      );
      throw new RpcException(
        error instanceof Error
          ? error.message
          : 'Update trigger params transaction creation failed'
      );
    }
  }

  // Private Functions
  private toOptionalScVal(value: string | null | undefined): xdr.ScVal {
    return value !== null && value !== undefined
      ? xdr.ScVal.scvString(value)
      : xdr.ScVal.scvVoid();
  }

  private async prepareSignAndSend(transaction: any) {
    try {
      const server = new StellarRpc.Server(
        await this.getFromSettings('SERVER')
      );
      const keypair = Keypair.fromSecret(await this.getFromSettings('KEYPAIR'));
      const preparedTransaction = await server.prepareTransaction(transaction);
      this.logger.log('Prepared transaction', StellarProcessor.name);
      preparedTransaction.sign(keypair);
      this.logger.log('Signed transaction', StellarProcessor.name);
      const txn = await server.sendTransaction(preparedTransaction);
      this.logger.log('Transaction successfully sent', StellarProcessor.name);
      return txn;
    } catch (error) {
      this.logger.error(
        `Error in transaction: ${error.message}`,
        error.stack,
        StellarProcessor.name
      );
      throw new RpcException(
        error instanceof Error ? error.message : 'Transaction failed'
      );
    }
  }

  private async getFromSettings(key: string) {
    const settings = await this.settingService.getPublic('STELLAR_SETTINGS');
    if (!settings?.value[key]) {
      throw new Error(`Setting ${key} not found in STELLAR_SETTINGS`);
    }
    return settings.value[key];
  }
}

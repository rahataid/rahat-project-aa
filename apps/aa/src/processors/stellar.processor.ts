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
    let lastError: any = null;

    while (attempt <= maxRetries) {
      try {
        this.logger.log(
          `Attempt ${attempt} of ${maxRetries}`,
          StellarProcessor.name
        );
        const transaction = await this.createTransaction(trigger);
        const result = await this.prepareSignAndSend(transaction);
        this.logger.log(
          `Transaction successfully processed - ID: ${result}`,
          StellarProcessor.name
        );
        return result;
      } catch (error) {
        lastError = error;
        this.logger.error(
          `Attempt ${attempt} failed with error: ${error.message}`,
          error.stack,
          StellarProcessor.name
        );

        if (attempt === maxRetries) {
          this.logger.error(
            `All ${maxRetries} attempts failed for trigger ${trigger.id}. Final error: ${error.message}`,
            StellarProcessor.name
          );
          throw error;
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
    let lastError: any = null;

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
          `Transaction successfully processed - ID: ${result}`,
          StellarProcessor.name
        );
        return result;
      } catch (error) {
        lastError = error;
        this.logger.error(
          `Attempt ${attempt} failed with error: ${error.message}`,
          error.stack,
          StellarProcessor.name
        );

        if (attempt === maxRetries) {
          this.logger.error(
            `All ${maxRetries} attempts failed for trigger ${triggerUpdate.id}. Final error: ${error.message}`,
            StellarProcessor.name
          );
          throw error;
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
  private async getStellarObjects() {
    const server = new StellarRpc.Server(await this.getFromSettings('SERVER'));
    const keypair = Keypair.fromSecret(await this.getFromSettings('KEYPAIR'));
    const publicKey = keypair.publicKey();
    const contractId = await this.getFromSettings('CONTRACTID');
    const sourceAccount = await server.getAccount(publicKey);
    const contract = new Contract(contractId);

    return {
      server,
      keypair,
      publicKey,
      contractId,
      sourceAccount,
      contract,
    };
  }

  private async createTransaction(trigger: AddTriggerDto) {
    try {
      const { sourceAccount, contract } = await this.getStellarObjects();
      
      const paramsHash = generateParamsHash(trigger.params);

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

      const { sourceAccount, contract } = await this.getStellarObjects();

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
            xdr.ScVal.scvSymbol(triggerUpdate.id),
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
        `Error creating update_trigger_params transaction: ${error.message}`,
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
      const { server, keypair } = await this.getStellarObjects();

      this.logger.log('Preparing transaction...', StellarProcessor.name);
      const preparedTransaction = await server.prepareTransaction(transaction);

      preparedTransaction.sign(keypair);

      this.logger.log(
        'Sending transaction to network...',
        StellarProcessor.name
      );
      const txn = await server.sendTransaction(preparedTransaction);

      // Check for contract-specific errors in the response
      if (txn.status === 'ERROR') {
        if (txn.errorResult) {
          // This would contain Soroban contract errors
          this.logger.error(
            `Contract error: ${JSON.stringify(txn.errorResult)}`,
            StellarProcessor.name
          );
        }
      }

      return txn;
    } catch (error) {
      // Extract contract error codes if available
      let errorMessage = error.message || 'Transaction failed';

      // Check for TriggerNotFound or TriggerAlreadyExists errors
      if (error.message?.includes('ContractError')) {
        this.logger.error(
          `Contract error details: ${error.message}`,
          StellarProcessor.name
        );
      }

      // Also log the raw error for debugging
      this.logger.error(
        `Transaction error: ${JSON.stringify(error)}`,
        error.stack,
        StellarProcessor.name
      );

      throw new RpcException(errorMessage);
    }
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

import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { BQUEUE, JOBS } from '../constants';
import { EVMCentralizedProcessor } from '../processors/evm-centralized.processor';

/**
 * Handles all write operations that require the deployer signer.
 * concurrency: 1 — jobs run serially, preventing nonce collisions.
 * Jobs are added without a name: evmTxQueue.add({ type, ...payload })
 */
@Processor(BQUEUE.EVM_TX)
@Injectable()
export class EVMTxDispatcher {
  private readonly logger = new Logger(EVMTxDispatcher.name);

  constructor(private readonly evmProcessor: EVMCentralizedProcessor) {}

  @Process({ concurrency: 1 })
  async processTx(job: Job) {
    const { type } = job.data;
    this.logger.log(`[TX] Started: ${type}`);
    switch (type) {
      case JOBS.EVM.ASSIGN_TOKENS:
        return this.evmProcessor.handleAssignTokens(job);
      case JOBS.EVM.REDEEM_INKIND:
        return this.evmProcessor.handleRedeemInkind(job);
      case JOBS.CONTRACT.FUND_ACCOUNT:
        return this.evmProcessor.handleFundAccount(job);
      case JOBS.CONTRACT.TRANSFER_TOKENS:
        return this.evmProcessor.handleTransferTokens(job);
      default:
        throw new Error(`Unknown TX job type: ${type}`);
    }
  }
}

/**
 * Handles all read-only operations (view calls, receipt checks).
 * concurrency: 5 — jobs run in parallel, no signer or nonce involved.
 * Jobs are added without a name: evmQueryQueue.add({ type, ...payload })
 */
@Processor(BQUEUE.EVM_QUERY)
@Injectable()
export class EVMQueryDispatcher {
  private readonly logger = new Logger(EVMQueryDispatcher.name);

  constructor(private readonly evmProcessor: EVMCentralizedProcessor) {}

  @Process({ concurrency: 5 })
  async processQuery(job: Job) {
    const { type } = job.data;
    this.logger.log(`[QUERY] Started: ${type}`);
    switch (type) {
      case JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE:
        return this.evmProcessor.handleStatusUpdate(job);
      case JOBS.CONTRACT.CHECK_BALANCE:
        return this.evmProcessor.handleCheckBalance(job);
      default:
        throw new Error(`Unknown QUERY job type: ${type}`);
    }
  }
}

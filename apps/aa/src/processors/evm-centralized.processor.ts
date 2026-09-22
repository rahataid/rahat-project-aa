import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { Job, Queue } from 'bull';
import { ethers } from 'ethers';
import { BQUEUE, CORE_MODULE, EVENTS, JOBS } from '../constants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { InkindsService } from '../inkinds';
import { ModuleRef } from '@nestjs/core';
import { lastValueFrom } from 'rxjs';

const AAProjectABI = require('../contracts/abis/AAProject.json');
const TriggerManagerABI = require('../contracts/abis/TriggerManager.json');

interface EVMStatusUpdateJob {
  txHash: string;
  groupUuid: string;
  beneficiaries: string[];
  amounts: string[];
  identifier: string;
  batchNumber: number;
  totalBatches: number;
}

@Injectable()
export class EVMCentralizedProcessor implements OnModuleInit {
  private readonly logger = new Logger(EVMCentralizedProcessor.name);

  private provider!: ethers.Provider;
  private signer!: ethers.Signer;
  private isInitialized = false;
  private _inkindService: InkindsService | null = null;

  // Cache for settings to avoid repeated DB queries
  private contractSettings: any = null;
  private chainSettings: any = null;
  private deployerPrivateKey: string | null = null;

  constructor(
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly beneficiaryService: BeneficiaryService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(BQUEUE.EVM_TX) private readonly evmTxQueue: Queue,
    @InjectQueue(BQUEUE.EVM_QUERY) private readonly evmQueryQueue: Queue,
    private readonly prismaService: PrismaService,
    private readonly moduleRef: ModuleRef
  ) {}

  async onModuleInit() {
    const chainSettings = await this.prismaService.setting.findFirst({
      where: { name: 'CHAIN_SETTINGS' },
    });
    const chainType = (chainSettings?.value as Record<string, unknown>)?.type;
    if (typeof chainType !== 'string' || chainType.toLowerCase() !== 'evm') {
      this.logger.log(
        `Chain type is "${chainType ?? 'unset'}", skipping EVM provider initialization`
      );
      return;
    }
    await this.initializeProvider();
    await this.recoverStuckDisbursements();
  }

  private async recoverStuckDisbursements(): Promise<void> {
    try {
      const stuckGroups = await this.prismaService.beneficiaryGroupTokens.findMany({
        where: { status: 'STARTED', isDisbursed: false },
        select: { uuid: true, groupId: true, info: true },
      });

      if (stuckGroups.length === 0) return;

      this.logger.log(`Recovery: found ${stuckGroups.length} in-progress disbursement(s)`);

      for (const group of stuckGroups) {
        const info = group.info as any;
        const batchStatus: any[] = info?.batchStatus || [];
        const totalBatches = info?.totalBatches || batchStatus.length;

        for (const batch of batchStatus) {
          if (batch.status === 'SUBMITTED' && batch.txHash) {
            // Tx was sent but status job may have been lost — re-queue receipt check
            this.logger.log(
              `Recovery: re-queuing status check for group ${group.groupId} batch ${batch.batchIndex + 1}/${totalBatches} txHash ${batch.txHash}`
            );
            await this.evmQueryQueue.add(
              {
                type: JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE,
                txHash: batch.txHash,
                groupUuid: group.groupId,
                beneficiaries: [],  // already stored in batch; logs use skipDuplicates
                amounts: [],
                batchNumber: batch.batchIndex + 1,
                totalBatches,
              },
              {
                delay: 5000,
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 },
              }
            );
          } else if (batch.status === 'PENDING' && !batch.txHash) {
            // Batch was initialized but never submitted — re-queue the assign job
            const resolved = await this.getBeneficiaryTokenBalance(group.groupId);
            if (!resolved || resolved.length === 0) continue;

            const startIndex = batch.batchIndex * 30;
            const batchBeneficiaries = resolved.slice(startIndex, Math.min(startIndex + 30, resolved.length));
            if (batchBeneficiaries.length === 0) continue;

            const jobId = `${group.groupId}-batch-${batch.batchIndex}`;
            this.logger.log(
              `Recovery: re-queuing assign job for group ${group.groupId} batch ${batch.batchIndex + 1}/${totalBatches}`
            );
            await this.evmTxQueue.add(
              {
                type: JOBS.EVM.ASSIGN_TOKENS,
                groupUuid: group.groupId,
                batchIndex: batch.batchIndex,
                totalBatches,
                beneficiaries: batchBeneficiaries.map(b => b.walletAddress),
                amounts: batchBeneficiaries.map(b => b.amount),
                dName: info?.dName,
              },
              {
                jobId,  // deterministic — Bull deduplicates if already queued
                attempts: 3,
                delay: 5000,
                removeOnComplete: true,
                backoff: { type: 'exponential', delay: 1000 },
              }
            );
          }
        }
      }
    } catch (error) {
      // Recovery is best-effort — don't block server startup
      this.logger.error(`Recovery scan failed: ${error.message}`, error.stack);
    }
  }

  private get inkindService(): InkindsService {
    return (this._inkindService ??= this.moduleRef.get(InkindsService, {
      strict: false,
    }));
  }

  private async getContractSettings() {
    if (!this.contractSettings) {
      this.contractSettings = await this.getFromSettings('CONTRACT');
      this.logger.log('Cached CONTRACT settings');
    }
    return this.contractSettings;
  }

  private async getChainSettings() {
    if (!this.chainSettings) {
      this.chainSettings = await this.getFromSettings('CHAIN_SETTINGS');
      this.logger.log('Cached CHAIN_SETTINGS');
    }
    return this.chainSettings;
  }

  private async getDeployerPrivateKey() {
    if (!this.deployerPrivateKey) {
      this.deployerPrivateKey = await this.getFromSettings(
        'DEPLOYER_PRIVATE_KEY'
      );
      this.logger.log('Cached DEPLOYER_PRIVATE_KEY');
    }
    return this.deployerPrivateKey;
  }

  private async initializeProvider() {
    try {
      const chainConfig = await this.getChainSettings();
      const deployerPrivateKey = await this.getDeployerPrivateKey();

      this.provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
      this.signer = new ethers.Wallet(deployerPrivateKey, this.provider);

      await this.provider.getBlockNumber();
      this.isInitialized = true;

      this.logger.log('EVM Provider initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize EVM provider:', error);
      this.isInitialized = false;
    }
  }

  private async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initializeProvider();
    }

    if (!this.isInitialized) {
      throw new RpcException('EVM provider not initialized');
    }
  }

  // ===== JOB HANDLERS =====

  private formatError(error: any) {
    return {
      message: error?.message,
      code: error?.code,
      reason: error?.reason ?? error?.shortMessage,
      txHash: error?.transaction?.hash ?? error?.receipt?.hash,
    };
  }

  /**
   * Processes ONE batch (<=30 beneficiaries) of a group's on-chain token assignment.
   * Called per batch instead of once per group so a 10k-beneficiary group never
   * needs a single transaction big enough to hit the block gas limit, and so one
   * bad batch can fail/retry independently without redoing the whole group.
   */
  async handleAssignTokens(job: Job<{
    groupUuid: string;
    batchIndex: number;
    totalBatches: number;
    beneficiaries: string[];
    amounts: string[];
    dName?: string;
  }>): Promise<any> {
    const { groupUuid, batchIndex, totalBatches, beneficiaries, amounts, dName } = job.data;

    try {
      this.logger.log(
        `Processing EVM assign tokens batch ${batchIndex + 1}/${totalBatches} for group ${groupUuid}`
      );

      // Why: batchStatus lives on the group's info JSON, read once here and passed
      // as `preloaded` to every downstream call in this job (idempotency check below,
      // the SUBMITTED write after broadcast, and requeueNextBatch). Avoids each of
      // those doing its own DB round trip for the same row within a single job run.
      const group = await this.beneficiaryService.getOneTokenReservationByGroupId(groupUuid);
      const preloaded = group ? { uuid: group.uuid, info: group.info } : undefined;

      // What: idempotency guard. Bull can redeliver a job (retry, redeploy, crash
      // recovery) — if this batch already has a txHash (SUBMITTED) or is already
      // on-chain confirmed, re-running the send below would double-disburse tokens
      // to the same beneficiaries. Bail out instead.
      const existingBatch = (group?.info as any)?.batchStatus?.[batchIndex];
      if (existingBatch?.status === 'SUBMITTED' || existingBatch?.status === 'CONFIRMED') {
        this.logger.log(
          `Batch ${batchIndex + 1}/${totalBatches} for group ${groupUuid} already submitted — skipping resubmit (job attempt ${job.attemptsMade + 1})`
        );
        return;
      }

      await this.ensureInitialized();

      // Create AAProject contract instance with signer for write operations
      const aaContract = await this.createContractInstanceSign(
        'AAPROJECT',
        AAProjectABI,
        this.signer
      );

      // What: defensive guard against an empty batch (shouldn't normally happen —
      // batches are sliced from a non-empty beneficiary list — but a stale/replayed
      // job could carry one). Why: still advance the chain instead of stalling the
      // whole group on a single dead batch.
      if (!beneficiaries || beneficiaries.length === 0) {
        this.logger.warn(`Batch ${batchIndex} has no beneficiaries, skipping`);
        if (batchIndex < totalBatches - 1) {
          await this.requeueNextBatch(groupUuid, batchIndex + 1, totalBatches, dName, preloaded);
        }
        return;
      }

      // How: read the RAHAT token's on-chain decimals so beneficiary amounts
      // (stored as plain numbers) can be converted to the contract's base unit.
      const contract = await this.getContractSettings();
      const formatedAbi = this.lowerCaseObjectKeys(contract.RAHATTOKEN.ABI);
      const rahatTokenContract = new ethers.Contract(
        contract.RAHATTOKEN.ADDRESS,
        formatedAbi,
        this.provider
      );
      const decimal = await rahatTokenContract.decimals.staticCall();

      // How: build the multicall payload for this batch only — [address, amount]
      // pairs for the <=30 beneficiaries in this job, not the whole group. This is
      // what keeps each transaction's gas cost bounded regardless of group size.
      const multicallTxnPayload = [];
      for (let i = 0; i < beneficiaries.length; i++) {
        const amount = amounts[i];
        if (amount) {
          const formattedAmountBn = ethers.parseUnits(amount.toString(), decimal);
          multicallTxnPayload.push([beneficiaries[i], formattedAmountBn]);
        }
      }

      // What: every beneficiary in the batch had a falsy/missing amount — nothing
      // to send. Why: skip the chain call and move on rather than submitting an
      // empty transaction, but still chain into the next batch so the group finishes.
      if (multicallTxnPayload.length === 0) {
        this.logger.warn(`Batch ${batchIndex} has no valid amounts, skipping`);
        if (batchIndex < totalBatches - 1) {
          await this.requeueNextBatch(groupUuid, batchIndex + 1, totalBatches, dName, preloaded);
        }
        return;
      }

      // How: one on-chain transaction carrying this batch's up-to-30 transfers via
      // multicall, instead of one transaction per beneficiary.
      const tx = await this.multiSend(
        aaContract,
        'assignTokenToBeneficiary',
        multicallTxnPayload
      );

      const txHash = tx.hash;
      this.logger.log(`Batch ${batchIndex + 1}/${totalBatches} submitted: ${txHash}`);
      // Persisted right after broadcast (not after confirmation) so a later error in this same
      // job attempt (e.g. the confirmation wait timing out) can never cause a resubmit — the
      // isBatchAlreadySubmitted guard above will see this txHash on the next attempt.

      // Mark as SUBMITTED (has txHash, awaiting confirmation) — distinct from initial PENDING (not yet sent)
      const infoAfterSubmit = await this.updateBatchStatus(groupUuid, batchIndex, {
        status: 'SUBMITTED',
        txHash,
        beneficiaryCount: multicallTxnPayload.length,
        submittedAt: new Date().toISOString(),
      }, preloaded);

      // Why: confirmation isn't checked inline (waiting for block finality here would
      // hold this queue worker for seconds/minutes per batch). Instead hand off to a
      // separate delayed job on the query queue that polls for the receipt later —
      // keeps this batch's job fast so the tx queue can move on to the next batch.
      this.evmQueryQueue.add(
        {
          type: JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE,
          txHash,
          groupUuid,
          beneficiaries,
          amounts,
          batchNumber: batchIndex + 1,
          totalBatches,
        },
        {
          delay: 12 * 1000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        }
      );

      // How: fire the next batch's assign job right after broadcasting this one —
      // don't wait for on-chain confirmation. Why: confirmation can take several
      // seconds; queuing eagerly is what turns N batches into a pipeline instead of
      // a strictly serial (submit -> wait -> confirm -> submit next) chain, cutting
      // total disbursement wall-clock time for large groups.
      if (batchIndex < totalBatches - 1) {
        await this.requeueNextBatch(groupUuid, batchIndex + 1, totalBatches, dName, infoAfterSubmit);
      } else {
        this.logger.log(`All ${totalBatches} batches submitted for group ${groupUuid}`);
      }
    } catch (error) {
      const errorDetails = this.formatError(error);
      const attemptsMade = job.attemptsMade + 1;
      const maxAttempts = job.opts?.attempts || 1;
      const isLastAttempt = attemptsMade >= maxAttempts;

      this.logger.error(
        `EVM assign tokens batch ${batchIndex + 1}/${totalBatches} for group ${groupUuid} failed ` +
          `(attempt ${attemptsMade}/${maxAttempts}): ${JSON.stringify(errorDetails)}`,
        error.stack
      );

      // What: record the failure on this batch's entry (not the whole group) so
      // sibling batches for the same group are unaffected and can keep progressing
      // independently of this one's retry state.
      const infoAfterFail = await this.updateBatchStatus(groupUuid, batchIndex, {
        status: 'FAILED',
        error: errorDetails,
        retryCount: attemptsMade,
        ...(isLastAttempt ? { terminal: true } : {}),
      });

      if (isLastAttempt) {
        // Retries exhausted — stop here instead of letting Bull keep re-throwing forever.
        // Reconcile the group so it doesn't stay STARTED with no further jobs able to progress it.
        await this.finalizeGroupIfAllBatchesSettled(groupUuid, totalBatches, infoAfterFail);
        return;
      }

      throw error;
    }
  }

  /**
   * After a batch reaches a terminal state (CONFIRMED, or FAILED with retries exhausted),
   * check whether every batch for the group is settled and close out the group status.
   * Mirrors the reconciliation done in handleStatusUpdate for on-chain-revert retries.
   */
  private async finalizeGroupIfAllBatchesSettled(
    groupUuid: string,
    totalBatches: number,
    preloaded?: { uuid: string; info: any }
  ): Promise<void> {
    const group = preloaded ?? (await this.beneficiaryService.getOneTokenReservationByGroupId(groupUuid));
    if (!group || !group.info) return;

    const batchStatus = (group.info as any).batchStatus || [];
    const settled = batchStatus.filter(
      (b: any) => b.status === 'CONFIRMED' || (b.status === 'FAILED' && b.terminal)
    );
    if (settled.length < totalBatches) return;

    const anyConfirmed = batchStatus.some((b: any) => b.status === 'CONFIRMED');
    this.logger.warn(
      `Group ${groupUuid}: all ${totalBatches} batches settled (${anyConfirmed ? 'partially' : 'none'} confirmed) — finalizing`
    );
    await this.prismaService.beneficiaryGroupTokens.update({
      where: { uuid: group.uuid },
      data: {
        status: anyConfirmed ? 'PARTIALLY_DISBURSED' : 'FAILED',
        isDisbursed: anyConfirmed,
        info: {
          ...(group.info as any),
          error: 'One or more batches failed after max retries',
          finalizedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      },
    });
    if (anyConfirmed) {
      this.eventEmitter.emit(EVENTS.TOKEN_DISBURSED, { groupUuid });
    }
  }

  /**
   * Queues the ASSIGN_TOKENS job for the next batch in a group's disbursement
   * chain. Why a dedicated function instead of inlining at each call site: it's
   * called from three places (handleAssignTokens on the empty-batch paths, on
   * the success path, and recoverStuckDisbursements on boot) and all three need
   * the same "resolve this group's next unsent batch and queue it" behavior —
   * one place keeps the chaining logic (and the skip/re-slice rules below)
   * consistent regardless of who triggers the next step.
   */
  private async requeueNextBatch(
    groupUuid: string,
    nextBatchIndex: number,
    totalBatches: number,
    dName?: string,
    preloaded?: { uuid: string; info: any }
  ): Promise<void> {
    // How: reuse the caller's already-fetched group row when given one (the hot
    // path — called right after handleAssignTokens already loaded/updated it),
    // otherwise fetch fresh. Avoids a redundant DB read per batch transition.
    const group = preloaded ?? (await this.beneficiaryService.getOneTokenReservationByGroupId(groupUuid));
    if (!group || !group.info) {
      this.logger.error(`Group ${groupUuid} not found for requeue`);
      return;
    }

    const batchStatus = (group.info as any)?.batchStatus || [];
    const nextBatch = batchStatus[nextBatchIndex];

    if (!nextBatch) {
      this.logger.warn(`No batch data for index ${nextBatchIndex}`);
      return;
    }

    // What: the target batch was already sent (SUBMITTED) or is done (CONFIRMED)
    // — this happens on re-disburse / recovery paths where some batches already
    // progressed. Why: don't resend it (would double-disburse); instead skip
    // forward recursively to find the next batch that actually still needs work.
    // Skip batches already submitted or confirmed — they have their own status job
    if (nextBatch.status === 'CONFIRMED' || nextBatch.status === 'SUBMITTED') {
      if (nextBatchIndex < totalBatches - 1) {
        await this.requeueNextBatch(groupUuid, nextBatchIndex + 1, totalBatches, dName, group);
      }
      return;
    }

    // Where the batching actually happens: the full beneficiary list for the
    // group is resolved once (wallet + amount per beneficiary, already ordered
    // consistently — see getBeneficiaryTokenBalance), then sliced into this
    // batch's fixed-size window. batchIndex * 30 is what maps a batch number
    // back to its slice of beneficiaries — the same math used when batches were
    // first split in evm-chain.service.ts's disburseBatch, so re-slicing here
    // (on retry/requeue/recovery) reproduces the exact same grouping without
    // needing to persist each batch's beneficiary list separately.
    const resolved = await this.getBeneficiaryTokenBalance(groupUuid);
    if (!resolved || resolved.length === 0) {
      this.logger.error(`No beneficiaries found for group ${groupUuid}`);
      return;
    }

    const startIndex = nextBatchIndex * 30;
    const endIndex = Math.min(startIndex + 30, resolved.length);
    const batchBeneficiaries = resolved.slice(startIndex, endIndex);

    // How: deterministic jobId (groupUuid + batchIndex, no timestamp/random
    // suffix) so Bull treats a duplicate requeue of the same batch as the same
    // job — protects against this function being called twice for the same
    // next batch (e.g. concurrent triggers) from creating two competing jobs.
    const jobId = `${groupUuid}-batch-${nextBatchIndex}`;
    await this.evmTxQueue.add(
      {
        type: JOBS.EVM.ASSIGN_TOKENS,
        groupUuid,
        batchIndex: nextBatchIndex,
        totalBatches,
        beneficiaries: batchBeneficiaries.map(b => b.walletAddress),
        amounts: batchBeneficiaries.map(b => b.amount),
        dName,
      },
      {
        jobId,
        attempts: 3,
        delay: 2000,
        removeOnComplete: true,
        backoff: { type: 'exponential', delay: 1000 },
      }
    );

    this.logger.log(`Queued batch ${nextBatchIndex + 1}/${totalBatches} for group ${groupUuid}`);
  }

  /**
   * Reads-modifies-writes one batch's entry in group.info.batchStatus.
   * Accepts an already-fetched { uuid, info } to skip the lookup on the hot path (called
   * once or twice per batch, up to 334 times per disbursement) — pass it whenever the caller
   * already has a group loaded from earlier in the same job. Returns the merged info so the
   * caller can chain further logic without re-fetching.
   */
  private async updateBatchStatus(
    groupUuid: string,
    batchIndex: number,
    updates: Partial<{
      status: string;
      txHash: string;
      beneficiaryCount: number;
      submittedAt: string;
      confirmedAt: string;
      error: string | Record<string, any>;
      retryCount: number;
      terminal: boolean;
      blockNumber: number | bigint | string;
      gasUsed: string;
    }>,
    preloaded?: { uuid: string; info: any }
  ): Promise<{ uuid: string; info: any } | undefined> {
    // Fetch without isDisbursed filter — record may already be finalized
    const group = preloaded ?? (await this.beneficiaryService.getOneTokenReservationByGroupId(groupUuid));
    if (!group || !group.info) return undefined;

    // Shallow copy, not a JSON.parse(JSON.stringify(...)) deep clone — we only replace the
    // top-level object, the batchStatus array, and one array entry (as a new object), never
    // mutate anything nested in place, so a deep clone buys nothing here and costs CPU that
    // scales with the (growing, up to 334-entry) batchStatus array on every single call.
    const info: any = { ...(group.info as any) };
    const batchStatus = [...(info.batchStatus || [])];

    batchStatus[batchIndex] = { ...(batchStatus[batchIndex] || { batchIndex }), ...updates };

    const disbursedCount = batchStatus
      .filter((b: any) => b.status === 'CONFIRMED')
      .reduce((sum: number, b: any) => sum + (b.beneficiaryCount || 0), 0);

    const mergedInfo = {
      ...info,
      batchStatus,
      disbursedBeneficiariesCount: disbursedCount,
      lastUpdated: new Date().toISOString(),
    };

    // Update directly by uuid — avoids the isDisbursed:false guard in updateGroupToken
    await this.prismaService.beneficiaryGroupTokens.update({
      where: { uuid: group.uuid },
      data: {
        status: 'STARTED',
        info: mergedInfo,
        updatedAt: new Date(),
      },
    });

    return { uuid: group.uuid, info: mergedInfo };
  }

  async handleStatusUpdate(job: Job<EVMStatusUpdateJob>): Promise<any> {
    try {
      await this.ensureInitialized();
      const { groupUuid, txHash, beneficiaries, amounts, batchNumber, totalBatches } = job.data;

      const group = await this.beneficiaryService.getOneTokenReservationByGroupId(groupUuid);
      if (!group) {
        this.logger.error(`Group ${groupUuid} not found`);
        return;
      }

      // Skip if already finalized
      if (group.isDisbursed || (group.status as string) === 'DISBURSED' || (group.status as string) === 'FAILED') {
        this.logger.log(`Group ${groupUuid} already finalized (${group.status}), skipping status update`);
        return;
      }

      const preloaded = { uuid: group.uuid, info: group.info };

      if (new Date(group.updatedAt).getTime() < new Date().getTime() - 60 * 60 * 1000) {
        this.logger.warn(`Group ${groupUuid} timed out, marking FAILED`);
        await this.prismaService.beneficiaryGroupTokens.update({
          where: { uuid: group.uuid },
          data: {
            status: 'FAILED',
            info: {
              ...(group.info as any),
              error: 'Transaction timeout - no confirmation received',
            },
            updatedAt: new Date(),
          },
        });
        return;
      }

      const batchIndex = batchNumber - 1;

      // A delayed/duplicate status-check job re-entering after this batch was already
      // confirmed would otherwise re-run log creation and the status write. group.info is
      // already loaded above, so this is an in-memory check, not an extra query.
      const existingBatch = (group.info as any)?.batchStatus?.[batchIndex];
      if (existingBatch?.status === 'CONFIRMED') {
        this.logger.log(`Batch ${batchNumber}/${totalBatches} for group ${groupUuid} already confirmed — skipping`);
        return;
      }

      try {
        const txReceipt = await this.provider.getTransactionReceipt(txHash);

        if (!txReceipt) {
          this.logger.log(`Transaction ${txHash} not yet mined, re-checking in 12s`);
          this.evmQueryQueue.add(
            { type: JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE, ...job.data },
            { delay: 12 * 1000, attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
          );
          return;
        }

        if (txReceipt.status === 1) {
          this.logger.log(`Batch ${batchNumber}/${totalBatches} confirmed: ${txHash}`);

          if (beneficiaries?.length > 0) {
            await this.createDisbursementLogsForBatch(group.uuid, txHash, beneficiaries, amounts, batchNumber, totalBatches);
          }

          // Returned info reflects the write we just made — no need to re-fetch to see it.
          const updated = await this.updateBatchStatus(groupUuid, batchIndex, {
            status: 'CONFIRMED',
            confirmedAt: new Date().toISOString(),
            blockNumber: txReceipt.blockNumber,
            gasUsed: txReceipt.gasUsed?.toString(),
          }, preloaded);
          const batchStatus = (updated?.info as any)?.batchStatus || [];

          // Only count batches that were actually submitted (CONFIRMED, SUBMITTED, or FAILED)
          // PENDING batches without txHash are queued but not yet sent — they have their own ASSIGN_TOKENS job
          const submittedBatches = batchStatus.filter((b: any) => b.txHash);
          const allSubmittedConfirmed = submittedBatches.length === totalBatches &&
            submittedBatches.every((b: any) => b.status === 'CONFIRMED');
          const failedRetryable = batchStatus.filter(
            (b: any) => b.status === 'FAILED' && !b.terminal && (b.retryCount || 0) < 3
          );

          if (allSubmittedConfirmed) {
            this.logger.log(`Group ${groupUuid} fully disbursed`);
            await this.prismaService.beneficiaryGroupTokens.update({
              where: { uuid: group.uuid },
              data: {
                status: 'DISBURSED',
                isDisbursed: true,
                info: {
                  ...(updated?.info as any),
                  finalizedAt: new Date().toISOString(),
                },
                updatedAt: new Date(),
              },
            });
            this.eventEmitter.emit(EVENTS.TOKEN_DISBURSED, { groupUuid });
          } else if (failedRetryable.length > 0) {
            this.logger.log(`Retrying ${failedRetryable.length} failed batches for group ${groupUuid}`);
            for (const failedBatch of failedRetryable) {
              await this.requeueFailedBatch(groupUuid, failedBatch.batchIndex, totalBatches, updated);
            }
          }
        } else {
          this.logger.warn(`Batch ${batchNumber}/${totalBatches} failed on chain: ${txHash}`);

          const afterFail = await this.updateBatchStatus(groupUuid, batchIndex, {
            status: 'FAILED',
            error: 'Transaction reverted on blockchain',
            blockNumber: txReceipt.blockNumber,
            gasUsed: txReceipt.gasUsed?.toString(),
          }, preloaded);

          const batchStatus = (afterFail?.info as any)?.batchStatus || [];
          const failedBatch = batchStatus[batchIndex];
          const retryCount = (failedBatch?.retryCount || 0) + 1;

          if (retryCount < 3) {
            this.logger.log(`Retrying batch ${batchNumber} (attempt ${retryCount}/3)`);
            await this.updateBatchStatus(groupUuid, batchIndex, { status: 'FAILED', retryCount }, afterFail);
            await this.requeueFailedBatch(groupUuid, batchIndex, totalBatches, afterFail);
          } else {
            this.logger.error(`Batch ${batchNumber} failed after max retries`);
            const afterTerminal = await this.updateBatchStatus(
              groupUuid,
              batchIndex,
              { status: 'FAILED', retryCount, terminal: true },
              afterFail
            );
            const finalBatchStatus = (afterTerminal?.info as any)?.batchStatus || [];
            const allDone = finalBatchStatus.every(
              (b: any) => b.status === 'CONFIRMED' || (b.status === 'FAILED' && (b.terminal || (b.retryCount || 0) >= 3))
            );
            if (allDone) {
              const anyConfirmed = finalBatchStatus.some((b: any) => b.status === 'CONFIRMED');
              await this.prismaService.beneficiaryGroupTokens.update({
                where: { uuid: group.uuid },
                data: {
                  status: anyConfirmed ? 'PARTIALLY_DISBURSED' : 'FAILED',
                  isDisbursed: anyConfirmed,
                  info: {
                    ...(afterTerminal?.info as any),
                    error: `Batch ${batchNumber} failed after max retries`,
                    finalizedAt: new Date().toISOString(),
                  },
                  updatedAt: new Date(),
                },
              });
              if (anyConfirmed) {
                this.eventEmitter.emit(EVENTS.TOKEN_DISBURSED, { groupUuid });
              }
            }
          }
        }
      } catch (error) {
        const errorDetails = this.formatError(error);
        this.logger.error(`Error checking tx ${txHash} for batch ${batchNumber}/${totalBatches}: ${JSON.stringify(errorDetails)}`, error.stack);
        await this.updateBatchStatus(groupUuid, batchIndex, {
          status: 'FAILED',
          error: { ...errorDetails, context: 'receipt_check_failed' },
        }, preloaded);
        this.evmQueryQueue.add(
          { type: JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE, ...job.data },
          { delay: 12 * 1000, attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
        );
      }
    } catch (error) {
      const errorDetails = this.formatError(error);
      this.logger.error(`Error in disbursement status update for group ${job.data?.groupUuid}: ${JSON.stringify(errorDetails)}`, error.stack);
      throw error;
    }
  }

  /**
   * Requeue a failed batch for retry
   */
  private async requeueFailedBatch(
    groupUuid: string,
    batchIndex: number,
    totalBatches: number,
    preloaded?: { uuid: string; info: any }
  ): Promise<void> {
    const group = preloaded ?? (await this.beneficiaryService.getOneTokenReservationByGroupId(groupUuid));
    if (!group || !group.info) return;

    const resolved = await this.getBeneficiaryTokenBalance(groupUuid);
    if (!resolved || resolved.length === 0) return;

    const startIndex = batchIndex * 30; // BATCH_SIZE
    const endIndex = Math.min(startIndex + 30, resolved.length);
    const batchBeneficiaries = resolved.slice(startIndex, endIndex);

    const dName = (group.info as any)?.dName;
    const jobId = `${groupUuid}-batch-${batchIndex}-retry-${Date.now()}`;
    
    await this.evmTxQueue.add(
      {
        type: JOBS.EVM.ASSIGN_TOKENS,
        groupUuid,
        batchIndex,
        totalBatches,
        beneficiaries: batchBeneficiaries.map(b => b.walletAddress),
        amounts: batchBeneficiaries.map(b => b.amount),
        dName,
      },
      {
        jobId,
        attempts: 3,
        delay: 5000,
        removeOnComplete: true,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    );

    this.logger.log(`Requeued failed batch ${batchIndex + 1}/${totalBatches} for group ${groupUuid}`);
  }

  private async createDisbursementLogsForBatch(
    groupTokenUuid: string,
    txHash: string,
    beneficiaries: string[],
    amounts: string[],
    batchNumber: number,
    totalBatches: number
  ): Promise<void> {
    try {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < beneficiaries.length; i += CHUNK_SIZE) {
        const chunk = beneficiaries.slice(i, i + CHUNK_SIZE);
        await this.prismaService.disbursementLogs.createMany({
          data: chunk.map((beneficiaryWalletAddress) => ({
            txnHash: txHash,
            beneficiaryGroupTokenId: groupTokenUuid,
            beneficiaryWalletAddress,
            createdAt: new Date(),
          })),
          skipDuplicates: true,
        });
      }
    } catch (error) {
      this.logger.error(`Error creating disbursement logs for batch ${batchNumber}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async handleCheckBalance(
    job: Job<{ address: string; tokenAddress: string; projectContract: string }>
  ): Promise<any> {
    try {
      this.logger.log(
        'Processing EVM balance check...',
        EVMCentralizedProcessor.name
      );
      await this.ensureInitialized();

      const { address, tokenAddress, projectContract } = job.data;

      const ethBalance = await this.provider.getBalance(address);

      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        this.provider
      );

      const tokenBalance = await tokenContract.balanceOf(address);

      const projectContractInstance = new ethers.Contract(
        projectContract,
        ['function benTokens(address) view returns (uint256)'],
        this.provider
      );

      const projectTokenBalance = await projectContractInstance.benTokens(
        address
      );

      return {
        balances: [
          {
            asset_type: 'native',
            balance: ethers.formatEther(ethBalance),
            asset_code: 'ETH',
            asset_issuer: null,
          },
          {
            asset_type: 'credit_alphanum4',
            balance: ethers.formatUnits(tokenBalance, 18),
            asset_code: 'RAHAT',
            asset_issuer: tokenAddress,
          },
          {
            asset_type: 'credit_alphanum4',
            balance: ethers.formatUnits(projectTokenBalance, 18),
            asset_code: 'PROJECT_TOKENS',
            asset_issuer: projectContract,
          },
        ],
        transactions: [],
      };
    } catch (error) {
      this.logger.error(
        `Error in EVM balance check: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw error;
    }
  }

  async handleFundAccount(
    job: Job<{ walletAddress: string; amount: string }>
  ): Promise<any> {
    try {
      this.logger.log(
        'Processing EVM fund account...',
        EVMCentralizedProcessor.name
      );
      await this.ensureInitialized();

      const { walletAddress, amount } = job.data;

      const tx = await this.signer.sendTransaction({
        to: walletAddress,
        value: ethers.parseEther(amount),
      });

      const receipt = await tx.wait();

      this.logger.log(
        `Successfully funded account ${walletAddress} with ${amount} ETH. Transaction: ${receipt?.hash}`,
        EVMCentralizedProcessor.name
      );

      return {
        success: true,
        txHash: receipt?.hash,
        blockNumber: receipt?.blockNumber,
        walletAddress,
        amount,
      };
    } catch (error) {
      this.logger.error(
        `Error in EVM fund account: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw error;
    }
  }

  async handleTransferTokens(
    job: Job<{ from: string; to: string; amount: string }>
  ): Promise<any> {
    try {
      this.logger.log(
        'Processing EVM transfer tokens...',
        EVMCentralizedProcessor.name
      );
      await this.ensureInitialized();

      const { from, to, amount } = job.data;

      const chainConfig = await this.getChainSettings();
      const tokenContract = new ethers.Contract(
        chainConfig.tokenContractAddress,
        [
          'function transfer(address to, uint256 amount) returns (bool)',
          'function balanceOf(address account) view returns (uint256)',
        ],
        this.signer
      );

      const balance = await tokenContract.balanceOf(from);
      const transferAmount = ethers.parseUnits(amount, 18);

      if (balance < transferAmount) {
        throw new Error(
          `Insufficient balance. Required: ${amount}, Available: ${ethers.formatUnits(
            balance,
            18
          )}`
        );
      }

      const tx = await tokenContract.transfer(to, transferAmount);
      const receipt = await tx.wait();

      this.logger.log(
        `Successfully transferred ${amount} tokens from ${from} to ${to}. Transaction: ${receipt?.hash}`,
        EVMCentralizedProcessor.name
      );

      return {
        success: true,
        txHash: receipt?.hash,
        blockNumber: receipt?.blockNumber,
        from,
        to,
        amount,
      };
    } catch (error) {
      this.logger.error(
        `Error in EVM transfer tokens: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw error;
    }
  }

  async handleRedeemInkind(
    job: Job<{
      beneficiaryAddress: string;
      vendorAddress: string;
      inkindId: string[];
    }>
  ): Promise<any> {
    try {
      // Step 1: Initialize - Ensure the EVM provider and signer are ready before any contract calls
      this.logger.log(
        'Processing EVM redeem inkind...',
        EVMCentralizedProcessor.name
      );
      await this.ensureInitialized();

      // Step 2: Connect - Get the INKINDTOKEN contract instance bound to the deployer signer
      const inkindTokenContract = await this.createContractInstanceSign(
        'INKINDTOKEN',
        null,
        this.signer
      );

      // Step 3: Fetch - Read the token decimal precision from the contract; fall back to 18 on failure
      const currentDecimalValue = await inkindTokenContract.decimals
        .staticCall()
        .then((decimals) => decimals)
        .catch((error) => {
          this.logger.error(
            `Error fetching INKINDTOKEN decimals: ${error.message}`,
            error.stack,
            EVMCentralizedProcessor.name
          );
          return 18;
        });

      // Step 4: Extract - Pull the redemption payload from the job data
      const { inkindId: inkinds, beneficiaryAddress, vendorAddress } = job.data;

      // Step 4.1: Scale - Convert the inkind count to the token's decimal unit for the contract call
      const inkindsValue = ethers.parseUnits(
        `${inkinds.length}`,
        currentDecimalValue
      );

      let txHash;

      // Step 5: Connect - Get the INKIND contract instance that exposes the redeemInkind function
      const inkindContract = await this.createContractInstanceSign(
        'INKIND',
        null,
        this.signer
      );

      // Step 6: Convert - Transform human-readable UUIDs into bytes32 hex values expected by the contract
      const convertedInkindUuid = inkinds.map((uuid) =>
        ethers.hexlify(ethers.toBeArray('0x' + uuid.replace(/-/g, '')))
      );

      try {
        // Step 7: Execute - Submit the redeemInkind transaction to the blockchain and wait for confirmation
        const redeemInkind = await inkindContract.redeemInkind(
          convertedInkindUuid,
          vendorAddress,
          beneficiaryAddress,
          inkindsValue
        );
        const inkindTxHash = await redeemInkind.wait();
        this.logger.log(
          `Inkind redeemed successfully. Transaction: ${inkindTxHash.hash}`,
          EVMCentralizedProcessor.name
        );
        txHash = inkindTxHash.hash;

        // Step 8: Persist - Save the confirmed transaction hash against the redeemed inkind records in the DB
        await this.inkindService.updateRedeemInkindTxHash(
          inkinds,
          txHash,
          beneficiaryAddress
        );
      } catch (error) {
        this.logger.error(
          `Error in EVM redeem inkind: ${error.message}`,
          error.stack,
          EVMCentralizedProcessor.name
        );
        throw error;
      }
    } catch (error) {
      this.logger.error(
        `Error in EVM redeem inkind: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw error;
    }
  }

  async handleRedeemVendorTokenForCash(
    job: Job<{
      redemptionUuid: string;
      vendorAddress: string;
      amount: string;
    }>
  ): Promise<any> {
    try {
      this.logger.log(
        'Processing EVM vendor token redemption for cash...',
        EVMCentralizedProcessor.name
      );

      const safeWalletSetting = await this.prismaService.setting.findUnique({
        where: { name: 'DEPLOYER_WALLET_KEY' },
      });

      if (!safeWalletSetting) {
        throw new RpcException('DEPLOYER_WALLET_KEY setting not found');
      }

      const offrampWalletAddress = safeWalletSetting.value;

      await this.ensureInitialized();

      const { redemptionUuid, vendorAddress, amount } = job.data;

      const inkindTokenContract = await this.createContractInstanceSign(
        'INKINDTOKEN',
        null,
        this.signer
      );

      const decimals = await inkindTokenContract.decimals.staticCall();
      const vendorBalance = await inkindTokenContract.balanceOf.staticCall(
        vendorAddress
      );
      const transferAmount = ethers.parseUnits(amount, decimals);

      if (vendorBalance < transferAmount) {
        throw new RpcException(
          `Insufficient vendor token balance. Required: ${amount}, Available: ${ethers.formatUnits(
            vendorBalance,
            decimals
          )}`
        );
      }

      this.logger.log(
        `Transferring ${amount} tokens from vendor ${vendorAddress} to offramp ${offrampWalletAddress}`,
        EVMCentralizedProcessor.name
      );

      const tx = await inkindTokenContract.transferFrom(
        vendorAddress,
        offrampWalletAddress,
        transferAmount
      );
      const receipt = await tx.wait();

      this.logger.log(
        `Successfully redeemed vendor tokens for cash. Transaction: ${receipt.hash}`,
        EVMCentralizedProcessor.name
      );

      await this.inkindService.updateVendorRedemptionTxHash(
        redemptionUuid,
        receipt.hash
      );

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        from: vendorAddress,
        to: offrampWalletAddress,
        amount,
        method: 'transferFrom',
      };
    } catch (error) {
      this.logger.error(
        `Error redeeming vendor tokens for cash: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw new RpcException(
        `Vendor token redemption failed: ${error.message}`
      );
    }
  }
  // ===== HELPER METHODS =====

  private async getFromSettings(key: string): Promise<any> {
    try {
      const settings = await this.prismaService.setting.findUnique({
        where: { name: key },
      });

      if (!settings?.value) {
        throw new Error(`${key} not found`);
      }

      return settings.value;
    } catch (error) {
      this.logger.error(`Error getting setting ${key}:`, error);
      throw error;
    }
  }

  private async multiSend(
    contract: ethers.Contract,
    functionName: string,
    callData: string[] | string[][]
  ) {
    const encodedData = this.generateMultiCallData(
      contract,
      functionName,
      callData
    );
    // Return as soon as the tx is broadcast — do not wait for confirmation here.
    // Confirmation is tracked separately via the EVM_QUERY status-check job (handleStatusUpdate),
    // so this call never blocks the (concurrency:1) EVM_TX worker or risks a resubmit if the
    // wait itself times out.
    return contract.multicall(encodedData);
  }

  private generateMultiCallData(
    contract: ethers.Contract,
    functionName: string,
    callData: string[] | string[][]
  ) {
    const encodedData = [];
    for (const call of callData) {
      const encoded = contract.interface.encodeFunctionData(functionName, [
        ...call,
      ]);
      encodedData.push(encoded);
    }
    return encodedData;
  }

  private async createContractInstanceSign(
    contractName: any,
    abi?: any,
    signer?: ethers.Signer
  ) {
    const contract = await this.getContractSettings();
    const contractSigner = signer || this.signer;

    let contractAddress: string;
    let contractABI: any;

    if (contractName === 'AAPROJECT') {
      contractAddress = contract.AAPROJECT.ADDRESS;
      contractABI = this.convertABI(contract.AAPROJECT.ABI);
    } else if (contractName === 'RAHATTOKEN') {
      contractAddress = contract.RAHATTOKEN.ADDRESS;
      contractABI = this.convertABI(contract.RAHATTOKEN.ABI);
    } else if (contractName === 'INKIND') {
      contractAddress = contract.INKIND.ADDRESS;
      contractABI = this.convertABI(contract.INKIND.ABI);
    } else if (contractName === 'INKINDTOKEN') {
      contractAddress = contract.INKINDTOKEN.ADDRESS;
      contractABI = this.convertABI(contract.INKINDTOKEN.ABI);
    } else {
      throw new Error(`Unsupported contract name: ${contractName}`);
    }

    return new ethers.Contract(contractAddress, contractABI, contractSigner);
  }

  private convertABI(oldABI: any): any {
    const convertKeysToLowerCase = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(convertKeysToLowerCase);
      }
      if (typeof obj === 'object' && obj !== null) {
        return Object.keys(obj).reduce((acc, key) => {
          acc[key.toLowerCase()] = convertKeysToLowerCase(obj[key]);
          return acc;
        }, {});
      }
      return obj;
    };
    try {
      return convertKeysToLowerCase(oldABI);
    } catch (error) {
      this.logger.error(`Failed to convert ABI: ${error.message}`);
      throw new RpcException(`Invalid ABI format: ${error.message}`);
    }
  }

  private lowerCaseObjectKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.lowerCaseObjectKeys(item));
    }
    if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj).reduce((acc, key) => {
        acc[key.toLowerCase()] = this.lowerCaseObjectKeys(obj[key]);
        return acc;
      }, {} as any);
    }
    return obj;
  }

  private async getDisbursableGroupsUuids() {
    const benGroups = await this.prismaService.beneficiaryGroupTokens.findFirst(
      {
        where: {
          AND: [
            { numberOfTokens: { gt: 0 } },
            { isDisbursed: false },
            { payout: { is: null } },
          ],
        },
        select: { uuid: true, groupId: true },
      }
    );
    return benGroups?.uuid;
  }

  async getBeneficiaryTokenBalance(groupUuid: string) {
    if (!groupUuid) return [];
    const [groups, tokens] = await Promise.all([
      this.fetchGroupedBeneficiaries(groupUuid),
      this.fetchGroupTokenAmounts(groupUuid),
    ]);
    return this.computeBeneficiaryTokenDistribution(groups, tokens);
  }

  private async fetchGroupedBeneficiaries(groupUuid: string) {
    const response = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.beneficiary.list_group_by_project' },
        { data: [{ uuid: groupUuid }] }
      )
    );

    return response.data ?? [];
  }

  private async fetchGroupTokenAmounts(groupUuid: string) {
    return this.prismaService.beneficiaryGroupTokens.findMany({
      where: { groupId: groupUuid, isDisbursed: false },
      select: { numberOfTokens: true, groupId: true },
    });
  }

  private computeBeneficiaryTokenDistribution(
    groups: any[],
    tokens: { numberOfTokens: number; groupId: string }[]
  ) {
    const csvData: Record<
      string,
      { phone: string; amount: string; id: string; walletAddress: string }
    > = {};


    groups.forEach((group) => {
      const groupToken = tokens.find((t) => t.groupId === group.uuid);
      const totalTokens = groupToken?.numberOfTokens ?? 0;

      const uniqueBeneficiaries = new Map<
        string,
        (typeof group.groupedBeneficiaries)[0]
      >();
      group.groupedBeneficiaries.forEach((item) => {
        const beneficiaryId = item.Beneficiary.uuid;
        if (!uniqueBeneficiaries.has(beneficiaryId)) {
          uniqueBeneficiaries.set(beneficiaryId, item);
        }
      });

      const totalBeneficiaries = uniqueBeneficiaries.size;
      if (totalBeneficiaries === 0) {
        this.logger.warn(`Group ${group.uuid} has no unique beneficiaries`);
        return;
      }

      const tokenPerBeneficiary = totalTokens / totalBeneficiaries;

      uniqueBeneficiaries.forEach(({ Beneficiary }) => {
        const phone = Beneficiary.pii.phone;
        const walletAddress = Beneficiary.walletAddress;
        const amount = tokenPerBeneficiary;

        if (csvData[phone]) {
          csvData[phone].amount = (
            parseFloat(csvData[phone].amount) + amount
          ).toString();
        } else {
          csvData[phone] = {
            phone,
            walletAddress,
            amount: amount.toString(),
            id: Beneficiary.uuid,
          };
        }
      });
    });

    return Object.values(csvData);
  }

  // ===== PUBLIC HELPER METHODS (Migrated from old EVMProcessor) =====

  /**
   * Create a read-only contract instance (using provider, not signer)
   */
  private async createContractInstance(contractName: string, abi: any) {
    const contract = await this.getContractSettings();
    const formatedAbi = this.convertABI(contract.AAPROJECT.ABI);

    return new ethers.Contract(
      contract.AAPROJECT.ADDRESS,
      formatedAbi,
      this.provider
    );
  }

  /**
   * Check if a beneficiary wallet has tokens in the benTokens mapping
   * @param beneficiaryAddress - The wallet address to check
   * @returns Promise<boolean> - True if beneficiary has tokens, false otherwise
   */
  async checkBeneficiaryHasTokens(
    beneficiaryAddress: string
  ): Promise<boolean> {
    try {
      await this.ensureInitialized();

      const aaContract = await this.createContractInstance(
        'AAPROJECT',
        AAProjectABI
      );

      // Call the benTokens mapping to get the token balance
      const tokenBalance = await aaContract.benTokens.staticCall(
        beneficiaryAddress
      );

      this.logger.log(
        `Beneficiary ${beneficiaryAddress} has ${tokenBalance.toString()} tokens`,
        EVMCentralizedProcessor.name
      );

      // Return true if the beneficiary has more than 0 tokens
      return tokenBalance > 0n;
    } catch (error) {
      this.logger.error(
        `Error checking beneficiary tokens for ${beneficiaryAddress}: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw new RpcException(
        `Failed to check beneficiary tokens: ${error.message}`
      );
    }
  }

  /**
   * Get the token balance for a beneficiary wallet from the benTokens mapping
   * @param beneficiaryAddress - The wallet address to check
   * @returns Promise<string> - The token balance as a string
   */
  async getBeneficiaryTokenBalanceFromContract(
    beneficiaryAddress: string
  ): Promise<string> {
    try {
      await this.ensureInitialized();

      const aaContract = await this.createContractInstance(
        'AAPROJECT',
        AAProjectABI
      );

      // Call the benTokens mapping to get the token balance
      const tokenBalance = await aaContract.benTokens(beneficiaryAddress);

      this.logger.log(
        `Beneficiary ${beneficiaryAddress} token balance: ${tokenBalance.toString()}`,
        EVMCentralizedProcessor.name
      );

      return tokenBalance.toString();
    } catch (error) {
      this.logger.error(
        `Error getting beneficiary token balance for ${beneficiaryAddress}: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw new RpcException(
        `Failed to get beneficiary token balance: ${error.message}`
      );
    }
  }

  /**
   * Get the project contract balance from RahatToken contract
   * @param projectAddress - The project contract address to check
   * @returns Promise<string> - The project token balance as a string
   */
  async getProjectTokenBalance(projectAddress: string): Promise<string> {
    try {
      await this.ensureInitialized();

      // Get contract settings to find RahatToken address and ABI
      const contract = await this.getContractSettings();
      const rahatTokenAddress = contract.RAHATTOKEN.ADDRESS;
      const rahatTokenABI = this.convertABI(contract.RAHATTOKEN.ABI);

      // Create RahatToken contract instance using the token address and ABI from settings
      const rahatTokenContract = new ethers.Contract(
        rahatTokenAddress,
        rahatTokenABI,
        this.provider
      );

      // Call the balanceOf function to get the project's token balance
      const tokenBalance = await rahatTokenContract.balanceOf(projectAddress);

      this.logger.log(
        `Project ${projectAddress} token balance: ${tokenBalance.toString()}`,
        EVMCentralizedProcessor.name
      );

      return tokenBalance.toString();
    } catch (error) {
      this.logger.error(
        `Error getting project token balance for ${projectAddress}: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw new RpcException(
        `Failed to get project token balance: ${error.message}`
      );
    }
  }

  /**
   * Check if project has sufficient tokens for disbursement
   * @param projectAddress - The project contract address to check
   * @param requiredAmount - The amount of tokens required
   * @returns Promise<boolean> - True if project has sufficient tokens, false otherwise
   */
  async checkProjectHasSufficientTokens(
    projectAddress: string,
    requiredAmount: string
  ): Promise<boolean> {
    try {
      const currentBalance = await this.getProjectTokenBalance(projectAddress);
      const hasSufficient = BigInt(currentBalance) >= BigInt(requiredAmount);

      this.logger.log(
        `Project ${projectAddress} has ${currentBalance} tokens, required: ${requiredAmount}, sufficient: ${hasSufficient}`,
        EVMCentralizedProcessor.name
      );

      return hasSufficient;
    } catch (error) {
      this.logger.error(
        `Error checking project sufficient tokens for ${projectAddress}: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw new RpcException(
        `Failed to check project sufficient tokens: ${error.message}`
      );
    }
  }

  /**
   * Transfer beneficiary tokens to vendor using AAProject contract
   * @param beneficiaryAddress - The beneficiary wallet address
   * @param vendorAddress - The vendor wallet address
   * @param amount - The amount of tokens to transfer
   * @returns Promise<any> - Transaction result with hash and status
   */
  async transferBeneficiaryTokenToVendor(
    beneficiaryAddress: string,
    vendorAddress: string,
    amount: string
  ): Promise<any> {
    try {
      await this.ensureInitialized();

      // Create contract instance with signer for transactions
      const aaContract = await this.createContractInstance(
        'AAPROJECT',
        AAProjectABI
      );

      // Check beneficiary token balance first
      const beneficiaryBalance = await aaContract.benTokens.staticCall(
        beneficiaryAddress
      );

      const contract = await this.getContractSettings();
      const formatedAbi = this.lowerCaseObjectKeys(contract.RAHATTOKEN.ABI);

      const rahatTokenContract = new ethers.Contract(
        contract.RAHATTOKEN.ADDRESS,
        formatedAbi,
        this.provider
      );

      const decimal = await rahatTokenContract.decimals.staticCall();
      const transferAmount = ethers.parseUnits(amount, decimal);

      const aaContractSigner = await this.createContractInstanceSign(
        'AAPROJECT',
        AAProjectABI,
        this.signer
      );

      const tx = await aaContractSigner.transferTokenToVendor(
        beneficiaryAddress,
        vendorAddress,
        transferAmount
      );
      const receipt = await tx.wait();

      this.logger.log(
        `Successfully transferred ${amount} tokens from beneficiary ${beneficiaryAddress} to vendor ${vendorAddress} using AAProject contract. Transaction: ${receipt.hash}`,
        EVMCentralizedProcessor.name
      );

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        from: beneficiaryAddress,
        to: vendorAddress,
        amount,
        method: 'transferTokenToVendor',
      };
    } catch (error) {
      this.logger.error(
        `Error transferring beneficiary tokens to vendor for ${beneficiaryAddress}: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw new RpcException(
        `Failed to transfer beneficiary tokens to vendor: ${error.message}`
      );
    }
  }

  /**
   * Get wallet balance for a given address using the AA contract
   * @param walletAddress - The wallet address to check balance for
   * @returns Promise<{ balance: string; address: string }> - The token balance for the given address
   */
  async getWalletBalance(
    walletAddress: string
  ): Promise<{ balance: string; address: string }> {
    try {
      this.logger.log(
        `Getting wallet balance for address: ${walletAddress}`,
        EVMCentralizedProcessor.name
      );
      await this.ensureInitialized();

      const rahatTokenContract = await this.createContractInstanceSign(
        'RAHATTOKEN'
      );
      const aaContract = await this.createContractInstance(
        'AAPROJECT',
        AAProjectABI
      );

      const decimals = await rahatTokenContract.decimals.staticCall();

      // Get token balance using benTokens.staticCall
      const tokenBalance = await aaContract.benTokens.staticCall(walletAddress);

      this.logger.log(
        `Token balance for ${walletAddress}: ${tokenBalance.toString()}`,
        EVMCentralizedProcessor.name
      );

      return {
        balance: ethers.formatUnits(tokenBalance, decimals),
        address: walletAddress,
      };
    } catch (error) {
      this.logger.error(
        `Error getting wallet balance for ${walletAddress}: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw new RpcException(`Failed to get wallet balance: ${error.message}`);
    }
  }

  /**
   * Get RahatToken ERC20 balance for a given wallet address
   * @param walletAddress - The wallet address to check RahatToken balance for
   * @returns Promise<{ balance: string; address: string }> - The RahatToken balance and address
   */
  async getRahatTokenBalance(
    walletAddress: string
  ): Promise<{ balance: string; address: string }> {
    try {
      this.logger.log(
        `Getting RahatToken balance for address: ${walletAddress}`,
        EVMCentralizedProcessor.name
      );
      await this.ensureInitialized();

      // Create RahatToken contract instance using the existing method
      const rahatTokenContract = await this.createContractInstanceSign(
        'RAHATTOKEN'
      );

      const decimal = await rahatTokenContract.decimals.staticCall();

      // Call the balanceOf function to get the wallet's RahatToken balance
      const tokenBalance = await rahatTokenContract.balanceOf.staticCall(
        walletAddress
      );

      const formattedAmount = ethers.formatUnits(tokenBalance, decimal);

      this.logger.log(
        `RahatToken balance for ${walletAddress}: ${tokenBalance.toString()}`,
        EVMCentralizedProcessor.name
      );

      return {
        balance: formattedAmount.toString(),
        address: walletAddress,
      };
    } catch (error) {
      this.logger.error(
        `Error getting RahatToken balance for ${walletAddress}: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw new RpcException(
        `Failed to get RahatToken balance: ${error.message}`
      );
    }
  }

  /**
   * Settle a vendor token redemption by pulling the already-approved allowance
   * from the vendor's wallet into the deployer wallet. The allowance is expected
   * to have been granted to the deployer wallet address ahead of time (via the
   * trusted forwarder), so this only needs to be signed by the deployer key.
   * @param vendorWalletAddress - The vendor wallet address that approved the allowance
   * @param amount - The token amount to pull, in whole token units (not wei)
   * @returns Promise<{ txHash: string }> - The settlement transaction hash
   */
  async settleVendorTokenRedemption(
    vendorWalletAddress: string,
    amount: number
  ): Promise<{ txHash: string }> {
    try {
      await this.ensureInitialized();

      const rahatTokenContract = await this.createContractInstanceSign(
        'RAHATTOKEN'
      );

      // RahatToken extends ERC2771Context and correctly overrides _msgSender(),
      // so a vendor's approve() relayed gasless through the trusted
      // ERC2771Forwarder is still recorded with the vendor as owner. The
      // allowance to pull from is allowance[vendor][deployer].
      const decimal = await rahatTokenContract.decimals.staticCall();
      const transferAmount = ethers.parseUnits(amount.toString(), decimal);
      const deployerAddress = await this.signer.getAddress();

      this.logger.log(
        `Settling vendor token redemption: pulling ${amount} tokens from vendor ${vendorWalletAddress} to deployer ${deployerAddress}`,
        EVMCentralizedProcessor.name
      );

      const tx = await rahatTokenContract.transferFrom(
        vendorWalletAddress,
        deployerAddress,
        transferAmount
      );
      const receipt = await tx.wait();

      this.logger.log(
        `Vendor token redemption settled. Transaction: ${receipt.hash}`,
        EVMCentralizedProcessor.name
      );

      return { txHash: receipt.hash };
    } catch (error) {
      this.logger.error(
        `Error settling vendor token redemption for ${vendorWalletAddress}: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw new RpcException(
        `Failed to settle vendor token redemption: ${error.message}`
      );
    }
  }

  /**
   * Get RahatToken ERC20 assigned for a given wallet address
   * @param walletAddress - The wallet address to check RahatToken assign for
   * @returns Promise<{ balance: string; address: string }> - The RahatToken balance and address
   */
  async getBeneficiaryBalance(
    walletAddress: string
  ): Promise<{ balance: string; address: string; decimals: string }> {
    try {
      this.logger.log(
        `Getting RahatToken balance for address: ${walletAddress}`,
        EVMCentralizedProcessor.name
      );
      await this.ensureInitialized();

      // Create RahatToken contract instance using the existing method
      const aaContract = await this.createContractInstanceSign('AAPROJECT');
      const rahatTokenContract = await this.createContractInstanceSign(
        'RAHATTOKEN'
      );

      const decimals = await rahatTokenContract.decimals.staticCall();
      // Call the balanceOf function to get the wallet's RahatToken balance
      const tokenBalance = await aaContract.benTokens.staticCall(walletAddress);

      this.logger.log(
        `RahatToken assign for ${walletAddress}: ${tokenBalance.toString()}`,
        EVMCentralizedProcessor.name
      );

      return {
        balance: tokenBalance.toString(),
        address: walletAddress,
        decimals: decimals.toString(),
      };
    } catch (error) {
      this.logger.error(
        `Error getting RahatToken assign for ${walletAddress}: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw new RpcException(
        `Failed to get RahatToken balance: ${error.message}`
      );
    }
  }
}

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
        `Chain type is "${
          chainType ?? 'unset'
        }", skipping EVM provider initialization`
      );
      return;
    }
    await this.initializeProvider();
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

  async handleAssignTokens(job: Job<{
    groupUuid: string;
    batchIndex: number;
    totalBatches: number;
    beneficiaries: string[];
    amounts: string[];
    dName?: string;
  }>): Promise<any> {
    this.logger.log('Starting handleAssignTokens with job data: ', job.data);
    const { groupUuid, batchIndex, totalBatches, beneficiaries, amounts, dName } = job.data;
    const BATCH_SIZE = 30; // Should match service layer

    try {
      this.logger.log(
        `Processing EVM assign tokens batch ${batchIndex + 1}/${totalBatches} for group ${groupUuid}`,
        EVMCentralizedProcessor.name
      );
      // Ensure EVM provider and signer are initialized
      await this.ensureInitialized();

      // Create AAProject contract instance with signer for write operations
      const aaContract = await this.createContractInstanceSign(
        'AAPROJECT',
        AAProjectABI,
        this.signer
      );

      // Validate batch data - skip empty batches but continue chain
      if (!beneficiaries || beneficiaries.length === 0) {
        this.logger.warn(`Batch ${batchIndex} has no beneficiaries, skipping`);
        // Still need to requeue next batch if exists
        if (batchIndex < totalBatches - 1) {
          await this.requeueNextBatch(groupUuid, batchIndex + 1, totalBatches, dName);
        }
        return;
      }

      // Get token decimals from RAHAT token contract for proper amount formatting
      const contract = await this.getContractSettings();
      const formatedAbi = this.lowerCaseObjectKeys(contract.RAHATTOKEN.ABI);
      const rahatTokenContract = new ethers.Contract(
        contract.RAHATTOKEN.ADDRESS,
        formatedAbi,
        this.provider
      );
      const decimal = await rahatTokenContract.decimals.staticCall();

      // Build multicall payload for this batch
      // Each entry: [beneficiaryAddress, amountInWei]
      const multicallTxnPayload = [];
      for (let i = 0; i < beneficiaries.length; i++) {
        const amount = amounts[i];
        if (amount) {
          const formattedAmountBn = ethers.parseUnits(amount.toString(), decimal);
          multicallTxnPayload.push([beneficiaries[i], formattedAmountBn]);
        }
      }

      if (multicallTxnPayload.length === 0) {
        this.logger.warn(`Batch ${batchIndex} has no valid amounts, skipping`);
        if (batchIndex < totalBatches - 1) {
          await this.requeueNextBatch(groupUuid, batchIndex + 1, totalBatches, dName);
        }
        return;
      }

      // Execute multicall for this batch
      this.logger.log(
        `Executing multicall for batch ${batchIndex + 1}/${totalBatches} with ${multicallTxnPayload.length} beneficiaries`,
        EVMCentralizedProcessor.name
      );

      const tx = await this.multiSend(
        aaContract,
        'assignTokenToBeneficiary',
        multicallTxnPayload
      );

      const txHash = tx.hash;
      this.logger.log(
        `Batch ${batchIndex + 1} submitted with txn hash: ${txHash}`,
        EVMCentralizedProcessor.name
      );

      // Update batchStatus in group token info
      await this.updateBatchStatus(groupUuid, batchIndex, {
        status: 'PENDING',
        txHash,
        beneficiaryCount: multicallTxnPayload.length,
        submittedAt: new Date().toISOString(),
      });

      // Queue status update job for this batch
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
          delay: 0.2 * 60 * 1000, // 12 seconds
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );

      // Self-requeue for next batch if not last
      if (batchIndex < totalBatches - 1) {
        await this.requeueNextBatch(groupUuid, batchIndex + 1, totalBatches, dName);
      } else {
        this.logger.log(
          `All ${totalBatches} batches submitted for group ${groupUuid}`,
          EVMCentralizedProcessor.name
        );
      }
    } catch (error) {
      this.logger.error(
        `Error in EVM assign tokens batch ${batchIndex}: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );

      // Update batch status to FAILED
      await this.updateBatchStatus(groupUuid, batchIndex, {
        status: 'FAILED',
        error: error.message,
        retryCount: 1,
      });

      // Don't requeue next batch on failure - let status job handle retries
      throw error;
    }
  }

  /**
   * Requeue the next batch job for processing
   * Called after a batch is submitted to continue the chain of batch processing
   * Skips already confirmed batches (idempotent re-disburse support)
   */
  private async requeueNextBatch(
    groupUuid: string,
    nextBatchIndex: number,
    totalBatches: number,
    dName?: string
  ): Promise<void> {
    // Fetch the next batch data from group token info
    const group = await this.beneficiaryService.getOneTokenReservationByGroupId(groupUuid);
    if (!group || !group.info) {
      this.logger.error(`Group ${groupUuid} not found for requeue`);
      return;
    }

    const batchStatus = (group.info as any)?.batchStatus || [];
    const nextBatch = batchStatus[nextBatchIndex];
    
    // If no batch data exists for this index, stop
    if (!nextBatch) {
      this.logger.warn(`No batch data for index ${nextBatchIndex}`);
      return;
    }

    // If already confirmed (from previous run), skip to next batch
    // This enables idempotent re-disburse - confirmed batches are not reprocessed
    if (nextBatch.status === 'CONFIRMED') {
      if (nextBatchIndex < totalBatches - 1) {
        await this.requeueNextBatch(groupUuid, nextBatchIndex + 1, totalBatches, dName);
      }
      return;
    }

    // Get beneficiaries for this batch from the original resolution
    // We fetch them again since they're not stored in info (only batch metadata is)
    const resolved = await this.getBeneficiaryTokenBalance(groupUuid);
    if (!resolved || resolved.length === 0) {
      this.logger.error(`No beneficiaries found for group ${groupUuid}`);
      return;
    }

    // Calculate slice indices for this batch (BATCH_SIZE = 30)
    const startIndex = nextBatchIndex * 30; // BATCH_SIZE
    const endIndex = Math.min(startIndex + 30, resolved.length);
    const batchBeneficiaries = resolved.slice(startIndex, endIndex);

    // Queue the next batch job with deterministic jobId for idempotency
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
        jobId, // Deterministic job ID prevents duplicate processing
        attempts: 3, // Retry failed jobs up to 3 times
        delay: 2000, // Initial delay before first attempt (2 seconds)
        removeOnComplete: true, // Clean up completed jobs
        backoff: {
          type: 'exponential', // Exponential backoff for retries
          delay: 1000, // Base delay of 1 second
        },
      }
    );

    this.logger.log(
      `Requeued batch ${nextBatchIndex + 1}/${totalBatches} for group ${groupUuid}`,
      EVMCentralizedProcessor.name
    );
  }

  /**
   * Update batch status in group token info
   * Updates a specific batch's status in the batchStatus array stored in info JSON field
   * Also updates the total disbursed beneficiaries count
   * 
   * Why this approach:
   * - Uses info JSON field to avoid schema migrations (no new columns needed)
   * - Deep copy prevents mutation of original Prisma object
   * - Atomic update of batchStatus + disbursedBeneficiariesCount ensures consistency
   * - Keeps group status as STARTED during processing, only finalizes when all batches done
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
      error: string;
      retryCount: number;
      blockNumber: number | bigint | string;
      gasUsed: string;
    }>
  ): Promise<void> {
    // Get the group token record
    const group = await this.beneficiaryService.getOneTokenReservationByGroupId(groupUuid);
    if (!group || !group.info) return;

    // Deep copy info to avoid mutating original object (Prisma objects are frozen)
    const info = JSON.parse(JSON.stringify(group.info));
    const batchStatus = info.batchStatus || [];
    
    // Initialize batch object if it doesn't exist (first time this batch is being processed)
    if (!batchStatus[batchIndex]) {
      batchStatus[batchIndex] = { batchIndex };
    }
    
    // Merge updates into the specific batch object
    // This preserves existing fields (like beneficiaryCount from initialization) while adding new ones
    batchStatus[batchIndex] = { ...batchStatus[batchIndex], ...updates };
    
    // Calculate total disbursed beneficiaries from all CONFIRMED batches
    // Only confirmed batches count toward the final disbursed total
    const disbursedCount = batchStatus
      .filter((b: any) => b.status === 'CONFIRMED')
      .reduce((sum: number, b: any) => sum + (b.beneficiaryCount || 0), 0);

    // Update the group token with new batch status and disbursed count
    // Status stays STARTED during processing; only changes to DISBURSED/FAILED/PARTIALLY_DISBURSED at the end
    await this.beneficiaryService.updateGroupToken({
      groupUuid,
      status: 'STARTED', // Keep group status as started during processing
      isDisbursed: false, // Not yet fully disbursed
      info: {
        ...info,
        batchStatus,
        disbursedBeneficiariesCount: disbursedCount,
        lastUpdated: new Date().toISOString(),
      },
    });
  }

  async handleStatusUpdate(job: Job<EVMStatusUpdateJob>): Promise<any> {
    try {
      this.logger.log(
        'Processing EVM disbursement status update...',
        EVMCentralizedProcessor.name
      );

      await this.ensureInitialized();
      const {
        groupUuid,
        txHash,
        beneficiaries,
        amounts,
        batchNumber,
        totalBatches,
      } = job.data;

      const group =
        await this.beneficiaryService.getOneTokenReservationByGroupId(
          groupUuid
        );

      if (!group) {
        this.logger.error(
          `Group ${groupUuid} not found`,
          EVMCentralizedProcessor.name
        );
        return;
      }

      if (
        new Date(group.updatedAt).getTime() <
        new Date().getTime() - 60 * 60 * 1000
      ) {
        this.logger.log(
          `Group ${groupUuid} updated more than 60 minutes ago, assuming disbursement failed`,
          EVMCentralizedProcessor.name
        );
        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'FAILED',
          isDisbursed: false,
          info: {
            ...(group.info && { ...JSON.parse(JSON.stringify(group.info)) }),
            error: 'Transaction timeout - no confirmation received',
          },
        });
        return;
      }

      try {
        const txReceipt = await this.provider.getTransactionReceipt(txHash);

        if (!txReceipt) {
          this.logger.log(
            `Transaction ${txHash} not yet confirmed, adding another status update job`,
            EVMCentralizedProcessor.name
          );

          this.evmQueryQueue.add(
            { type: JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE, ...job.data },
            {
              delay: 0.2 * 60 * 1000,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
            }
          );
          return;
        }

        const batchIndex = batchNumber - 1;

        if (txReceipt.status === 1) {
          this.logger.log(
            `Transaction ${txHash} confirmed successfully (batch ${batchNumber}/${totalBatches})`,
            EVMCentralizedProcessor.name
          );

          if (beneficiaries && amounts && beneficiaries.length > 0) {
            await this.createDisbursementLogsForBatch(
              groupUuid,
              txHash,
              beneficiaries,
              amounts,
              batchNumber,
              totalBatches
            );
          }

          // Update batch status to CONFIRMED
          await this.updateBatchStatus(groupUuid, batchIndex, {
            status: 'CONFIRMED',
            confirmedAt: new Date().toISOString(),
            blockNumber: txReceipt.blockNumber,
            gasUsed: txReceipt.gasUsed?.toString(),
          });

          // Check if all batches are done
          const updatedGroup = await this.beneficiaryService.getOneTokenReservationByGroupId(groupUuid);
          const batchStatus = (updatedGroup?.info as any)?.batchStatus || [];
          
          const allConfirmed = batchStatus.every((b: any) => b.status === 'CONFIRMED');
          const anyPending = batchStatus.some((b: any) => b.status === 'PENDING');
          const failedBatches = batchStatus.filter((b: any) => b.status === 'FAILED' && (b.retryCount || 0) < 3);

          if (allConfirmed) {
            // All batches confirmed - finalize group
            // Status: DISBURSED, isDisbursed: true
            // This is the happy path where all batches succeeded
            await this.beneficiaryService.updateGroupToken({
              groupUuid,
              status: 'DISBURSED',
              isDisbursed: true,
              info: {
                ...(updatedGroup.info && { ...JSON.parse(JSON.stringify(updatedGroup.info)) }),
                finalizedAt: new Date().toISOString(),
              },
            });
            this.eventEmitter.emit(EVENTS.TOKEN_DISBURSED, { groupUuid });
            this.logger.log(`Group ${groupUuid} fully disbursed (${totalBatches} batches)`);
          } else if (!anyPending && failedBatches.length > 0) {
            // No pending batches, but some failed with retries left - requeue failed batches
            // This handles cases where some batches failed but have retries remaining
            this.logger.log(`Requeueing ${failedBatches.length} failed batches for group ${groupUuid}`);
            for (const failedBatch of failedBatches) {
              await this.requeueFailedBatch(groupUuid, failedBatch.batchIndex, totalBatches);
            }
            // Requeue status job to monitor retries
            // Shorter delay (30s) since we're monitoring retries
            this.evmQueryQueue.add(
              { type: JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE, ...job.data },
              {
                delay: 30 * 1000, // 30 seconds
                attempts: 3,
                backoff: {
                  type: 'exponential',
                  delay: 5000,
                },
              }
            );
          } else if (anyPending) {
            // Still have pending batches - requeue status job to check them
            // This handles cases where some batches are still processing
            // Longer delay (12s) since we're waiting for pending batches to complete
            this.evmQueryQueue.add(
              { type: JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE, ...job.data },
              {
                delay: 0.2 * 60 * 1000,
                attempts: 3,
                backoff: {
                  type: 'exponential',
                  delay: 2000,
                },
              }
            );
          }
        } else {
          this.logger.log(
            `Transaction ${txHash} failed on blockchain (batch ${batchNumber}/${totalBatches})`,
            EVMCentralizedProcessor.name
          );

          // Update batch status to FAILED
          await this.updateBatchStatus(groupUuid, batchIndex, {
            status: 'FAILED',
            error: 'Transaction failed on blockchain',
            blockNumber: txReceipt.blockNumber,
            gasUsed: txReceipt.gasUsed?.toString(),
          });

          // Check if we should retry
          const updatedGroup = await this.beneficiaryService.getOneTokenReservationByGroupId(groupUuid);
          const batchStatus = (updatedGroup?.info as any)?.batchStatus || [];
          const failedBatch = batchStatus[batchIndex];
          const retryCount = (failedBatch?.retryCount || 0) + 1;

          if (retryCount < 3) {
            // Retry this batch
            this.logger.log(`Retrying batch ${batchNumber} (attempt ${retryCount}/3)`);
            await this.updateBatchStatus(groupUuid, batchIndex, {
              status: 'PENDING',
              retryCount,
            });
            await this.requeueFailedBatch(groupUuid, batchIndex, totalBatches);
          } else {
            // Max retries exceeded for this batch
            this.logger.error(`Batch ${batchNumber} failed after 3 retries`);
            
            // Check if all batches are done (failed or confirmed)
            // This determines if the entire disbursement is complete
            const allDone = batchStatus.every((b: any) => b.status === 'CONFIRMED' || (b.status === 'FAILED' && (b.retryCount || 0) >= 3));
            
            if (allDone) {
              // At least one batch confirmed means partial success
              const anyConfirmed = batchStatus.some((b: any) => b.status === 'CONFIRMED');
              await this.beneficiaryService.updateGroupToken({
                groupUuid,
                status: anyConfirmed ? 'PARTIALLY_DISBURSED' : 'FAILED',
                isDisbursed: anyConfirmed,
                info: {
                  ...(updatedGroup.info && { ...JSON.parse(JSON.stringify(updatedGroup.info)) }),
                  error: `Batch ${batchNumber} failed after 3 retries`,
                  finalizedAt: new Date().toISOString(),
                },
              });
              // Emit event even for partial disbursement (some tokens were sent)
              if (anyConfirmed) {
                this.eventEmitter.emit(EVENTS.TOKEN_DISBURSED, { groupUuid });
              }
            }
          }
        }
      } catch (error) {
        this.logger.error(
          `Error checking transaction status for ${txHash}: ${error.message}`,
          EVMCentralizedProcessor.name
        );

        await this.updateBatchStatus(groupUuid, batchNumber - 1, {
          status: 'FAILED',
          error: `Error checking transaction status: ${error.message}`,
        });

        // Requeue status job to retry
        this.evmQueryQueue.add(
          { type: JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE, ...job.data },
          {
            delay: 0.2 * 60 * 1000,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          }
        );
      }
    } catch (error) {
      this.logger.error(
        `Error in EVM disbursement status update: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw error;
    }
  }

  /**
   * Requeue a failed batch for retry
   */
  private async requeueFailedBatch(
    groupUuid: string,
    batchIndex: number,
    totalBatches: number
  ): Promise<void> {
    const group = await this.beneficiaryService.getOneTokenReservationByGroupId(groupUuid);
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

  /**
   * Create disbursement log entries for a batch of beneficiaries
   * Uses bulk insert (createMany) for efficiency - creates up to 500 records at a time
   * 
   * Why bulk insert:
   * - Reduces database round trips from N (one per beneficiary) to N/500
   * - Significantly faster for large batches (30 beneficiaries per batch)
   * - Each log entry tracks: beneficiary, amount, txHash, batch info, timestamps
   */
  private async createDisbursementLogsForBatch(
    groupUuid: string,
    txHash: string,
    beneficiaries: string[],
    amounts: string[],
    batchNumber: number,
    totalBatches: number
  ): Promise<void> {
    // Create log entries in chunks of 500 for bulk insert efficiency
    const CHUNK_SIZE = 500;
    
    for (let i = 0; i < beneficiaries.length; i += CHUNK_SIZE) {
      const chunk = beneficiaries.slice(i, i + CHUNK_SIZE);
      const chunkAmounts = amounts.slice(i, i + CHUNK_SIZE);
      
      // Build array of log entries for this chunk
      const logEntries = chunk.map((beneficiary, idx) => ({
        groupUuid,
        beneficiary,
        amount: chunkAmounts[idx],
        txHash,
        batchNumber,
        totalBatches,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      
      // Bulk insert using createMany for efficiency
      await this.prisma.disbursementLog.createMany({
        data: logEntries,
        skipDuplicates: true, // Prevent duplicate entries if job runs twice
      });
    }
    
    this.logger.log(
      `Created ${beneficiaries.length} disbursement logs for batch ${batchNumber}/${totalBatches}`,
      EVMCentralizedProcessor.name
    );
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

  private async createDisbursementLogsForBatch(
    groupUuid: string,
    txHash: string,
    beneficiaries: string[],
    amounts: string[],
    batchNumber: number,
    totalBatches: number
  ) {
    try {
      this.logger.log(
        `Creating DisbursementLogs for batch ${batchNumber}/${totalBatches} with ${beneficiaries.length} beneficiaries`,
        EVMCentralizedProcessor.name
      );

      const groupToken =
        await this.beneficiaryService.getOneTokenReservationByGroupId(
          groupUuid
        );

      if (!groupToken) {
        this.logger.error(
          `Group token not found for group ${groupUuid}`,
          EVMCentralizedProcessor.name
        );
        return;
      }

      const disbursementLogs = beneficiaries.map((beneficiaryWalletAddress, i) => ({
        uuid: undefined, // Prisma will generate
        txnHash: txHash,
        beneficiaryGroupTokenId: groupToken.uuid,
        beneficiaryWalletAddress,
        createdAt: new Date(),
      }));

      // Bulk insert in chunks of 500
      const CHUNK_SIZE = 500;
      for (let i = 0; i < disbursementLogs.length; i += CHUNK_SIZE) {
        const chunk = disbursementLogs.slice(i, i + CHUNK_SIZE);
        await this.prismaService.disbursementLogs.createMany({
          data: chunk,
          skipDuplicates: true,
        });
      }

      this.logger.log(
        `Successfully created ${disbursementLogs.length} DisbursementLogs records for batch ${batchNumber}`,
        EVMCentralizedProcessor.name
      );

      return disbursementLogs;
    } catch (error) {
      this.logger.error(
        `Error creating DisbursementLogs for batch ${batchNumber}: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw error;
    }
  }

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
    const tx = await contract.multicall(encodedData);
    const result = await tx.wait();
    return result;
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

    this.logger.log(`Found ${groups.length} groups`);
    this.logger.log(`Found ${tokens.length} tokens`);

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

    this.logger.log(`Computing beneficiary token distribution`);
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

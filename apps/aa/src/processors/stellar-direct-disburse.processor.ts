import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma';
import { StellarBatchStatus } from '@prisma/client';
import {
  Keypair,
  StellarClient,
  StellarClientConfig,
  MAX_TRANSFERS_PER_BATCH,
} from '@rahataid/stellar';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { StellarChainService } from '../chain/chain-services/stellar-chain.service';
import { BQUEUE, EVENTS, JOBS } from '../constants';
import { chunkArray } from '../utils/utility';

interface DirectDisbursePayload {
  dName: string;
  groups: string[];
}

@Processor(BQUEUE.STELLAR_DISBURSE)
@Injectable()
export class StellarDirectDisburseProcessor {
  private readonly logger = new Logger(StellarDirectDisburseProcessor.name);

  constructor(
    private readonly beneficiaryService: BeneficiaryService,
    private readonly stellarChainService: StellarChainService,
    private readonly settingsService: SettingsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService
  ) {}

  private async buildStellarClient(): Promise<{
    client: StellarClient;
    distributionPublicKey: string;
  }> {
    const sponsorSettings = await this.settingsService.getPublic(
      'STELLAR_SPONSOR_SETTINGS'
    );
    if (!sponsorSettings?.value) {
      throw new Error('STELLAR_SPONSOR_SETTINGS not found in settings table');
    }

    const distributionSecretSetting = await this.settingsService.getPublic(
      'STELLAR_DISTRUBUTION_WALLET_SECRET'
    );
    if (!distributionSecretSetting?.value) {
      throw new Error(
        'STELLAR_DISTRUBUTION_WALLET_SECRET not found in settings table'
      );
    }

    const distributionWalletSecret = distributionSecretSetting.value as string;
    const distributionPublicKey = Keypair.fromSecret(
      distributionWalletSecret
    ).publicKey();

    const config: StellarClientConfig = {
      ...(sponsorSettings.value as unknown as StellarClientConfig),
      distributionWalletSecret,
    };

    const client = new StellarClient(config);
    return { client, distributionPublicKey };
  }

  @Process({ name: JOBS.STELLAR_DIRECT.DISBURSE, concurrency: 1 })
  async handleDisburse(job: Job<DirectDisbursePayload>): Promise<void> {
    const { dName, groups } = job.data;
    const groupUuid = groups[0];
    const startedAt = Date.now();

    this.logger.log(
      `Processing direct Stellar disbursement for group ${groupUuid}: ${dName}`
    );

    try {
      // 1. Guard: active token reservation must exist
      const groupToken =
        await this.beneficiaryService.getOneTokenReservationByGroupId(
          groupUuid
        );
      if (!groupToken) {
        this.logger.warn(`No token reservation found for group ${groupUuid}`);
        return;
      }

      // 2. Resolve beneficiaries with token amounts
      const benData = await this.stellarChainService.getBeneficiaryTokenBalance(
        [groupUuid]
      );
      if (!benData.length) {
        this.logger.warn(`No beneficiaries found for group ${groupUuid}`);
        return;
      }

      this.logger.log(
        `Found ${benData.length} beneficiaries for group ${groupUuid}`
      );

      // 3. Validate individual amounts (mirrors generateCsv guard in stellar-chain.service)
      for (const ben of benData) {
        const amount = parseFloat(ben.amount);
        if (isNaN(amount) || amount < 1) {
          throw new Error(
            `Invalid amount for beneficiary ${ben.id}: "${ben.amount}" must be a number >= 1`
          );
        }
      }

      // 4. Build Stellar client with distribution wallet
      const { client: stellarClient, distributionPublicKey } =
        await this.buildStellarClient();

      // 5. Balance check: distribution wallet must hold enough tokens
      const totalNeeded = benData.reduce(
        (sum, b) => sum + parseFloat(b.amount),
        0
      );
      const balanceStr = await stellarClient.getBalance(distributionPublicKey);
      const balance = parseFloat(balanceStr);

      this.logger.log(
        `Distribution wallet ${distributionPublicKey} balance: ${balance}, required: ${totalNeeded}`
      );

      if (balance < totalNeeded) {
        throw new Error(
          `Insufficient balance in distribution wallet ${distributionPublicKey}: ` +
            `has ${balance}, needs ${totalNeeded}`
        );
      }

      // 6. Per-beneficiary trustline check
      this.logger.log(
        `Checking for trustline of beneficiaries of ${groupUuid}`
      );
      await this.prisma.beneficiaryGroupTokens.updateMany({
        where: { groupId: groupUuid, status: 'NOT_DISBURSED' },
        data: {
          status: 'PREPARING',
        },
      });
      for (const ben of benData) {
        const hasTrust = await stellarClient.hasTrustline(ben.walletAddress);
        if (!hasTrust) {
          throw new Error(
            `Beneficiary ${ben.id} (${ben.walletAddress}) has no trustline for the asset`
          );
        }
      }

      // 7. Chunk and send (Stellar max 12 ops per tx)
      const chunks = chunkArray(benData, MAX_TRANSFERS_PER_BATCH);
      const totalBatches = chunks.length;

      this.logger.log(
        `Sending ${benData.length} payments in ${totalBatches} batch(es) for group ${groupUuid}`
      );

      await this.prisma.beneficiaryGroupTokens.updateMany({
        where: { groupId: groupUuid, status: 'PREPARING' },
        data: {
          status: 'STARTED',
        },
      });
      // 7a. Upsert batch checkpoint rows — PENDING for new, leave COMPLETED untouched (resume safety)
      for (const [i, chunk] of chunks.entries()) {
        const batchIndex = i + 1;
        const batchTotal = chunk
          .reduce((sum, b) => sum + parseFloat(b.amount), 0)
          .toFixed(7);

        await this.prisma.stellarDisburseBatch.upsert({
          where: {
            unique_group_batch: { groupTokenUuid: groupToken.uuid, batchIndex },
          },
          create: {
            groupTokenUuid: groupToken.uuid,
            batchIndex,
            totalBatches,
            status: StellarBatchStatus.PENDING,
            recipientCount: chunk.length,
            totalAmount: batchTotal,
            recipients: chunk.map((b) => ({
              walletAddress: b.walletAddress,
              amount: b.amount,
            })),
          },
          // If row exists and is COMPLETED (prior successful run), don't touch it
          update: {
            totalBatches,
            recipientCount: chunk.length,
            totalAmount: batchTotal,
            recipients: chunk.map((b) => ({
              walletAddress: b.walletAddress,
              amount: b.amount,
            })),
            // Reset FAILED rows to PENDING so they retry; leave COMPLETED rows alone via where clause below
          },
        });
      }

      // 7b. Re-fetch all batch rows so we can skip already-COMPLETED ones (crash-resume path)
      const batchRows = await this.prisma.stellarDisburseBatch.findMany({
        where: { groupTokenUuid: groupToken.uuid },
        orderBy: { batchIndex: 'asc' },
      });

      const alreadyCompleted = batchRows.filter(
        (r) => r.status === StellarBatchStatus.COMPLETED
      ).length;

      if (alreadyCompleted > 0) {
        this.logger.log(
          `Resuming disbursement for group ${groupUuid}: ${alreadyCompleted}/${totalBatches} batches already completed`
        );
      }

      // 7c. Send each pending batch
      for (const [i, chunk] of chunks.entries()) {
        const batchIndex = i + 1;
        const batchRow = batchRows.find((r) => r.batchIndex === batchIndex);

        // Skip batches that already succeeded in a previous run
        if (batchRow?.status === StellarBatchStatus.COMPLETED) {
          this.logger.log(
            `Batch ${batchIndex}/${totalBatches} already completed — skipping`
          );
          continue;
        }

        const batchStart = Date.now();
        const batchTotal = chunk
          .reduce((sum, b) => sum + parseFloat(b.amount), 0)
          .toFixed(7);

        // Mark PROCESSING before we touch Stellar
        await this.prisma.stellarDisburseBatch.update({
          where: {
            unique_group_batch: { groupTokenUuid: groupToken.uuid, batchIndex },
          },
          data: {
            status: StellarBatchStatus.PROCESSING,
            startedAt: new Date(),
            error: null,
            attemptCount: { increment: 1 },
          },
        });

        this.logger.debug(
          `Submitting batch ${batchIndex}/${totalBatches} (${chunk.length} receivers)`
        );

        const receivers = chunk.map((b) => ({
          destination: b.walletAddress,
          amount: b.amount,
        }));

        try {
          const result = await stellarClient.sendBatchPayment(receivers);
          const elapsed = Date.now() - batchStart;

          await this.prisma.stellarDisburseBatch.update({
            where: {
              unique_group_batch: {
                groupTokenUuid: groupToken.uuid,
                batchIndex,
              },
            },
            data: {
              status: StellarBatchStatus.COMPLETED,
              txHash: result.hash,
              completedAt: new Date(),
              timeTakenMs: elapsed,
              error: null,
            },
          });

          this.logger.log(
            `Batch ${batchIndex}/${totalBatches} done — tx: ${result.hash} (${elapsed}ms)`
          );
        } catch (batchErr) {
          const msg =
            batchErr instanceof Error ? batchErr.message : String(batchErr);

          await this.prisma.stellarDisburseBatch.update({
            where: {
              unique_group_batch: {
                groupTokenUuid: groupToken.uuid,
                batchIndex,
              },
            },
            data: {
              status: StellarBatchStatus.FAILED,
              completedAt: new Date(),
              timeTakenMs: Date.now() - batchStart,
              error: msg,
            },
          });

          this.logger.error(
            `Batch ${batchIndex}/${totalBatches} failed: ${msg}`
          );
          throw batchErr; // outer catch marks group FAILED
        }
      }

      // 7d. Collect final batch state for audit info
      const finalBatchRows = await this.prisma.stellarDisburseBatch.findMany({
        where: { groupTokenUuid: groupToken.uuid },
        orderBy: { batchIndex: 'asc' },
      });

      const successBatches = finalBatchRows.filter(
        (r) => r.status === StellarBatchStatus.COMPLETED
      );

      // 8. Mark group as DISBURSED
      const completedAt = new Date().toISOString();
      const totalElapsedMs = Date.now() - startedAt;

      const stellarSponsorSettings = (
        await this.settingsService.getPublic('STELLAR_SPONSOR_SETTINGS')
      )?.value;

      // Asset infommation for logs
      const assetCode = stellarSponsorSettings?.['assetCode'] ?? null;
      const assetIssuer = stellarSponsorSettings?.['assetIssuer'] ?? null;
      const assetInfo = `${assetCode}:${assetIssuer}`;

      await this.beneficiaryService.updateGroupToken({
        groupUuid,
        status: 'DISBURSED',
        isDisbursed: true,
        info: {
          ...(groupToken.info && {
            ...JSON.parse(JSON.stringify(groupToken.info)),
          }),
          disbursementName: dName,
          distributionWallet: distributionPublicKey,
          asset: {
            network: stellarSponsorSettings?.['network'] ?? null,
            tokenCode: assetInfo,
          },
          summary: {
            beneficiaryCount: benData.length,
            totalAmountDisbursed: totalNeeded.toFixed(7),
            batchCount: totalBatches,
            batchesCompleted: successBatches.length,
            batchesFailed: finalBatchRows.length - successBatches.length,
          },
          timing: {
            startedAt: new Date(startedAt).toISOString(),
            completedAt,
            totalElapsedMs,
            disbursementTimeTaken: `${totalElapsedMs}ms`,
          },
          batches: finalBatchRows.map((r) => ({
            batch: r.batchIndex,
            status: r.status,
            txHash: r.txHash,
            recipientCount: r.recipientCount,
            totalAmount: r.totalAmount,
            startedAt: r.startedAt,
            completedAt: r.completedAt,
            timeTakenMs: r.timeTakenMs,
            attemptCount: r.attemptCount,
            error: r.error ?? undefined,
          })),
        },
      });

      this.logger.log(
        `Group ${groupUuid} disbursed successfully. ` +
          `Batches: ${chunks.length}, took ${totalElapsedMs}ms`
      );

      // 9. Emit token disbursed event
      this.eventEmitter.emit(EVENTS.TOKEN_DISBURSED, { groupUuid });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Direct disbursement failed for group ${groupUuid}: ${err.message}`,
        err.stack
      );

      await this.beneficiaryService
        .updateGroupToken({
          groupUuid,
          status: 'FAILED',
          isDisbursed: false,
          info: {
            error: err.message,
            failedAt: new Date().toISOString(),
          },
        })
        .catch((updateErr: unknown) =>
          this.logger.error(
            `Failed to mark group ${groupUuid} as FAILED: ${
              updateErr instanceof Error ? updateErr.message : String(updateErr)
            }`
          )
        );

      throw err;
    }
  }
}

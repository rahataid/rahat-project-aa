import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma'; // for BeneficiarySdpReceiver + Beneficiary reads/writes below
import { SdpClient } from '@rahataid/stellar-sdp';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { StellarChainService, BeneficiaryCsvData } from '../chain/chain-services/stellar-chain.service'; // BeneficiaryCsvData used by the new phone-sync helpers
import { BQUEUE, EVENTS, JOBS } from '../constants';
import { AsyncQueueService } from '../queue/async-queue.service'; // outbox tracking for RECEIVER_PHONE_SYNC jobs

// SDP usually completes within seconds, so poll early and back off (15s, 30s, 60s, 2m, then 3m).
const FIRST_STATUS_CHECK_DELAY_MS = 15 * 1000;
const STATUS_CHECK_DELAY_MS = 3 * 60 * 1000; // max gap between checks
const STATUS_CHECK_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
const nextCheckDelay = (poll: number) =>
  Math.min(FIRST_STATUS_CHECK_DELAY_MS * 2 ** poll, STATUS_CHECK_DELAY_MS);

@Processor(BQUEUE.STELLAR_SDP)
@Injectable()
export class SdpStellarProcessor {
  private readonly logger = new Logger(SdpStellarProcessor.name);
  private sdpClient: SdpClient | null = null;

  constructor(
    @InjectQueue(BQUEUE.STELLAR_SDP) private readonly stellarSdpQueue: Queue,
    private readonly beneficiaryService: BeneficiaryService,
    private readonly stellarChainService: StellarChainService,
    private readonly settingsService: SettingsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService, // reads/writes tbl_beneficiary_sdp_receivers + Beneficiary.phone
    private readonly asyncQueueService: AsyncQueueService // marks RECEIVER_PHONE_SYNC jobs processing/complete/failed
  ) {}

  /**
   * Mirrors StellarChainService's private getDisbursementSettings() mode check
   * (chain-services/stellar-chain.service.ts:1849-1868). Defaults to 'SDP' when
   * unconfigured, same as the chain service.
   */
  private async getStellarDisbursementMode(): Promise<'SDP' | 'DIRECT'> {
    const settings = await this.settingsService.getPublic(
      'STELLAR_DISBURSEMENT_SETTINGS'
    );
    const value = (settings?.value as Record<string, unknown>) || {};
    return value.STELLAR_DISBURSMENT_MODE === 'DIRECT' ? 'DIRECT' : 'SDP';
  }

  private async getSdpClient(): Promise<SdpClient> {
    if (this.sdpClient) return this.sdpClient;

    const sdpSettings = await this.settingsService.getPublic('SDP_SETTINGS');
    if (!sdpSettings?.value) {
      throw new Error('SDP_SETTINGS not found in settings table');
    }

    const config = sdpSettings.value as Record<string, string>;
    this.sdpClient = new SdpClient({
      sdpUrl: config.sdpUrl,
      tenantName: config.tenantName,
      apiKey: config.apiKey,
    });

    return this.sdpClient;
  }

  private async getSdpSettings(): Promise<Record<string, string>> {
    const sdpSettings = await this.settingsService.getPublic('SDP_SETTINGS');
    if (!sdpSettings?.value) {
      throw new Error('SDP_SETTINGS not found in settings table');
    }
    return sdpSettings.value as Record<string, string>;
  }

  @Process({ name: JOBS.STELLAR_SDP.DISBURSE, concurrency: 1 })
  async handleDisburse(
    job: Job<{ dName: string; groups: string[]; skipStatusUpdate?: boolean }>
  ): Promise<void> {
    const { dName, groups, skipStatusUpdate } = job.data;
    const groupUuid = groups[0];

    this.logger.log(
      `Processing SDP disbursement for group ${groupUuid}: ${dName}`
    );

    // Guard added for the phone-sync fix: this processor is SDP-only, so this
    // shouldn't normally be reachable in DIRECT mode, but check explicitly in
    // case mode flips between job enqueue and this job actually running.
    const disbursementMode = await this.getStellarDisbursementMode();
    if (disbursementMode !== 'SDP') {
      this.logger.warn(
        `STELLAR_DISBURSMENT_MODE is '${disbursementMode}', not 'SDP' — skipping SDP disbursement for group ${groupUuid}`
      );
      return;
    }

    try {
      const groupToken =
        await this.beneficiaryService.getOneTokenReservationByGroupId(
          groupUuid
        );

      if (!groupToken) {
        this.logger.warn(`No token reservation found for group ${groupUuid}`);
        return;
      }

      // was `const` before the phone-sync fix — now reassigned below after filtering
      // out beneficiaries whose stale-phone retry failed
      let benData = await this.stellarChainService.getBeneficiaryTokenBalance(
        [groupUuid]
      );

      if (!benData.length) {
        this.logger.warn(`No beneficiaries found for group ${groupUuid}`);
        return;
      }

      // Pre-disbursement staleness guard (docs/sdp/sdp-beneficiary-phone-sync-plan.md §5):
      // a beneficiary whose phone changed since their SDP receiver was last synced
      // must not be disbursed to under the stale SDP-side phone number. Retry the
      // sync inline, once; on failure, drop only that beneficiary from this batch.
      benData = await this.reconcileStalePhoneSyncs(benData);

      if (!benData.length) {
        this.logger.warn(
          `All beneficiaries in group ${groupUuid} were excluded by the pre-disbursement phone-sync guard`
        );
        return;
      }

      this.logger.log(
        `Generating CSV for ${benData.length} beneficiaries in group ${groupUuid}`
      );

      const csvBuffer = this.stellarChainService.generateCsv(benData);
      const sdpClient = await this.getSdpClient();
      const sdpSettings = await this.getSdpSettings();

      this.logger.log({
        name: dName,
        wallet_id: sdpSettings.walletId,
        asset_id: sdpSettings.assetId,
        verification_field: sdpSettings.verificationField,
        filename: `${dName}_instructions.csv`,
      });
      const disbursement = await sdpClient.disbursements.create({
        name: dName,
        wallet_id: sdpSettings.walletId,
        asset_id: sdpSettings.assetId,
        registration_contact_type: 'PHONE_NUMBER_AND_WALLET_ADDRESS',
        verification_field: sdpSettings.verificationField,
        receiver_registration_message_template: '',
        file: csvBuffer,
        filename: `${dName}_instructions.csv`,
      });

      this.logger.log(
        `SDP disbursement created: ${disbursement.id} for group ${groupUuid}`
      );

      // Capture each new receiver's SDP id right away (docs/sdp/sdp-beneficiary-phone-sync-plan.md
      // §2) — SDP creates receivers synchronously while processing the uploaded CSV, so they
      // already exist by the time disbursements.create() resolves. This is the only place
      // tbl_beneficiary_sdp_receivers rows get created.
      await this.captureSdpReceiverIds(disbursement.id, benData);

      await sdpClient.disbursements.updateStatus(disbursement.id, {
        status: 'STARTED',
      });

      this.logger.log(
        `SDP disbursement ${disbursement.id} status updated to STARTED`
      );

      await this.beneficiaryService.updateGroupToken({
        groupUuid,
        status: skipStatusUpdate ? groupToken.status : 'STARTED',
        isDisbursed: false,
        info: {
          ...(groupToken.info && {
            ...JSON.parse(JSON.stringify(groupToken.info)),
          }),
          disbursement,
          disbursementStartedAt: new Date().toISOString(),
        },
      });

      if (skipStatusUpdate) {
        this.logger.log(
          `Skipping status polling for group ${groupUuid} (disburse-on-create); status will be reconciled on explicit disburse`
        );
        return;
      }

      await this.stellarSdpQueue.add(
        JOBS.STELLAR_SDP.DISBURSEMENT_STATUS_UPDATE,
        {
          disbursementId: disbursement.id,
          groupUuid,
          startedAt: Date.now(),
          poll: 0,
        },
        {
          delay: nextCheckDelay(0),
          attempts: 3,
          removeOnComplete: true,
          backoff: { type: 'exponential', delay: 5000 },
        }
      );
    } catch (error: any) {
      this.logger.error(
        `SDP disbursement failed for group ${groupUuid}: ${error.message}`,
        error.stack
      );

      await this.beneficiaryService.updateGroupToken({
        groupUuid,
        status: 'FAILED',
        isDisbursed: false,
        info: {
          error: error.message,
          failedAt: new Date().toISOString(),
        },
      });

      throw error;
    }
  }

  /**
   * Pre-disbursement staleness guard — docs/sdp/sdp-beneficiary-phone-sync-plan.md §5.
   * For any beneficiary whose tbl_beneficiary_sdp_receivers row is not SYNCED, retry
   * the PATCH /receivers/{id} once, inline. Drop (log + exclude) only that beneficiary
   * from this batch on failure — never abort the whole group over one stuck record.
   */
  private async reconcileStalePhoneSyncs(
    benData: BeneficiaryCsvData[]
  ): Promise<BeneficiaryCsvData[]> {
    // only beneficiaries in THIS batch, and only rows not already SYNCED — most
    // batches will have none, hence the early-return right below
    const staleRows = await this.prisma.beneficiarySdpReceiver.findMany({
      where: {
        beneficiaryId: { in: benData.map((ben) => ben.id) },
        syncStatus: { not: 'SYNCED' },
      },
    });

    if (!staleRows.length) return benData; // common case: nothing stale, no extra SDP calls

    const excludedBeneficiaryIds = new Set<string>();
    const sdpClient = await this.getSdpClient();

    for (const row of staleRows) {
      const ben = benData.find((b) => b.id === row.beneficiaryId);
      if (!ben) continue; // not part of this batch

      try {
        // ben.phone here is the current AA phone (fresh from getBeneficiaryTokenBalance),
        // not whatever stale value SDP still has on the receiver
        await sdpClient.receivers.update(row.sdpReceiverId, {
          phone_number: ben.phone,
        });
        await this.prisma.beneficiarySdpReceiver.update({
          where: { beneficiaryId: row.beneficiaryId },
          data: {
            syncStatus: 'SYNCED',
            lastSyncedPhone: ben.phone,
            lastSyncError: null,
          },
        });
        this.logger.log(
          `Pre-disbursement phone sync succeeded for beneficiary ${row.beneficiaryId}`
        );
      } catch (error: any) {
        // retry failed — exclude just this beneficiary, keep the rest of the batch going
        excludedBeneficiaryIds.add(row.beneficiaryId);
        await this.prisma.beneficiarySdpReceiver
          .update({
            where: { beneficiaryId: row.beneficiaryId },
            data: { syncStatus: 'FAILED', lastSyncError: error.message },
          })
          .catch(() => undefined); // best-effort status write; don't let it mask the real error below
        this.logger.error(
          `Pre-disbursement phone sync failed for beneficiary ${row.beneficiaryId}, excluding from this disbursement: ${error.message}`
        );
      }
    }

    return benData.filter((ben) => !excludedBeneficiaryIds.has(ben.id));
  }

  /**
   * Capture each receiver's SDP id right after instructions upload — docs/sdp/
   * sdp-beneficiary-phone-sync-plan.md §2. Scoped to this one disbursement via
   * GET /disbursements/{id}/receivers (listReceivers), not a tenant-wide sweep.
   *
   * NOTE: the exact shape of SDP's receivers-per-disbursement response isn't
   * pinned down to the field level in docs/sdp/sdp-beneficiary-mapping-research.md
   * (only that the endpoint exists) — handled defensively below for both a nested
   * `{ receiver: {...} }` shape and a flat `{ id, external_id, ... }` shape.
   */
  private async captureSdpReceiverIds(
    disbursementId: string,
    benData: BeneficiaryCsvData[]
  ): Promise<void> {
    try {
      const sdpClient = await this.getSdpClient();
      // scoped to this one disbursement, not a tenant-wide GET /receivers sweep
      const { data: entries } = await sdpClient.disbursements.listReceivers(
        disbursementId
      );

      // used to ignore any entry that isn't one of ours (shouldn't happen, but cheap to check)
      const benIdsByUuid = new Set(benData.map((ben) => ben.id));

      for (const entry of entries as Record<string, unknown>[]) {
        // defensive: accept either `{ receiver: {...} }` or a flat receiver object
        const receiver =
          (entry.receiver as Record<string, unknown>) || entry;
        const receiverId = receiver.id as string | undefined;
        const externalId = receiver.external_id as string | undefined;
        const phone = receiver.phone_number as string | undefined;

        // AA sends `RECEIVER_<uuid>` as the CSV `id` column (external_id on SDP's side).
        const beneficiaryId = externalId?.replace(/^RECEIVER_/, '');

        // skip anything missing an id, not ours, or not part of this batch
        if (!receiverId || !beneficiaryId || !benIdsByUuid.has(beneficiaryId)) {
          continue;
        }

        // first disbursement for this beneficiary → create; a later one that
        // somehow lands here again (shouldn't, since phone stays in sync) → update
        await this.prisma.beneficiarySdpReceiver.upsert({
          where: { beneficiaryId },
          update: {
            sdpReceiverId: receiverId,
            lastSyncedPhone: phone,
            syncStatus: 'SYNCED',
            lastSyncError: null,
          },
          create: {
            beneficiaryId,
            sdpReceiverId: receiverId,
            lastSyncedPhone: phone,
            syncStatus: 'SYNCED',
          },
        });
      }
    } catch (error: any) {
      // Non-fatal: the disbursement itself already succeeded. A missing mapping
      // row just means the next phone edit for this beneficiary has nothing to
      // sync yet — it self-heals on the following disbursement's capture pass.
      this.logger.error(
        `Failed to capture SDP receiver ids for disbursement ${disbursementId}: ${error.message}`,
        error.stack
      );
    }
  }

  // concurrency: 5 — these are independent single-receiver PATCHes, safe to run in parallel
  @Process({ name: JOBS.STELLAR_SDP.RECEIVER_PHONE_SYNC, concurrency: 5 })
  async handleReceiverPhoneSync(
    job: Job<{ beneficiaryId: string; _asyncJobId?: string }>
  ): Promise<void> {
    // _asyncJobId ties this Bull job back to its tbl_async_queue_jobs row, if any
    // (absent when this job was enqueued directly rather than via AsyncQueueService)
    const { beneficiaryId, _asyncJobId } = job.data;

    if (_asyncJobId) {
      const stillTracked = await this.asyncQueueService.markProcessing(
        _asyncJobId
      );
      if (!stillTracked) return; // job row was cleaned up/cancelled
    }

    try {
      // mode may have flipped to DIRECT since this job was enqueued — don't call
      // an SDP that's no longer the active disbursement path
      const mode = await this.getStellarDisbursementMode();
      if (mode !== 'SDP') {
        if (_asyncJobId) await this.asyncQueueService.complete(_asyncJobId);
        return;
      }

      // fetch both in parallel — independent reads, no ordering dependency
      const [beneficiary, mapRow] = await Promise.all([
        this.prisma.beneficiary.findUnique({ where: { uuid: beneficiaryId } }),
        this.prisma.beneficiarySdpReceiver.findUnique({
          where: { beneficiaryId },
        }),
      ]);

      // beneficiary deleted, or no SDP receiver (DIRECT mode / EVM beneficiary /
      // row removed) — nothing to sync, treat as done rather than an error
      if (!beneficiary || !mapRow) {
        if (_asyncJobId) await this.asyncQueueService.complete(_asyncJobId);
        return;
      }

      // Re-fetch current phone rather than trusting the job payload (docs/sdp/
      // sdp-beneficiary-phone-sync-plan.md §4) — a later edit may have landed
      // since this job was enqueued; this always syncs the latest value.
      const currentPhone = beneficiary.phone;

      if (currentPhone === mapRow.lastSyncedPhone) {
        // a later run (or the pre-disbursement guard) already synced this value
        await this.prisma.beneficiarySdpReceiver.update({
          where: { beneficiaryId },
          data: { syncStatus: 'SYNCED' },
        });
        if (_asyncJobId) await this.asyncQueueService.complete(_asyncJobId);
        return;
      }

      const sdpClient = await this.getSdpClient();
      // the actual fix: push AA's current phone to SDP directly, bypassing SDP's
      // own (broken) phone-based receiver matching entirely
      await sdpClient.receivers.update(mapRow.sdpReceiverId, {
        phone_number: currentPhone,
      });

      await this.prisma.beneficiarySdpReceiver.update({
        where: { beneficiaryId },
        data: {
          syncStatus: 'SYNCED',
          lastSyncedPhone: currentPhone,
          lastSyncError: null,
        },
      });

      if (_asyncJobId) await this.asyncQueueService.complete(_asyncJobId);
    } catch (error: any) {
      // Covers both SDP 409 cases (payment in flight, or phone already taken by
      // another receiver) and anything else — left FAILED either way; Bull's own
      // `attempts` retries this a few times, and AsyncQueueRecoveryService's boot
      // sweep (registered in queue.module.ts) retries it again later.
      await this.prisma.beneficiarySdpReceiver
        .update({
          where: { beneficiaryId },
          data: { syncStatus: 'FAILED', lastSyncError: error.message },
        })
        .catch(() => undefined);

      if (_asyncJobId) {
        await this.asyncQueueService.fail(_asyncJobId, error.message);
      }

      this.logger.error(
        `SDP receiver phone sync failed for beneficiary ${beneficiaryId}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  @Process({
    name: JOBS.STELLAR_SDP.DISBURSEMENT_STATUS_UPDATE,
    concurrency: 1,
  })
  async handleStatusUpdate(
    job: Job<{
      disbursementId: string;
      groupUuid: string;
      startedAt: number;
      poll?: number;
    }>
  ): Promise<void> {
    const { disbursementId, groupUuid, startedAt, poll = 0 } = job.data;
    const tag = `[SdpStatus] group=${groupUuid} disbursement=${disbursementId}`;

    this.logger.debug(`${tag} check #${poll + 1} (job ${job.id})`);

    try {
      // Duplicate/stale jobs are expected (explicit disburse queues an immediate check on top of
      // the delayed one, and an old cycle's job can outlive it). They must be no-ops, not errors:
      // updateGroupToken only finds an undisbursed token and would throw and burn all retries.
      const token = await this.beneficiaryService.getOneTokenReservationByGroupId(
        groupUuid
      );
      const tokenDisbursementId = (token?.info as any)?.disbursement?.id;
      if (!token) {
        this.logger.warn(`${tag} no token reservation found, dropping check`);
        return;
      }
      if (tokenDisbursementId !== disbursementId) {
        this.logger.warn(
          `${tag} stale check: latest token ${token.uuid} tracks disbursement ${tokenDisbursementId}, dropping`
        );
        return;
      }
      if (token.isDisbursed) {
        this.logger.log(
          `${tag} token ${token.uuid} already DISBURSED (duplicate check), nothing to do`
        );
        return;
      }

      const sdpClient = await this.getSdpClient();
      const disbursement = await sdpClient.disbursements.get(disbursementId);
      const status = disbursement.status?.toUpperCase();

      this.logger.debug(`${tag} SDP status: ${status}`);

      const existingInfo = token.info
        ? JSON.parse(JSON.stringify(token.info))
        : {};
      const realStartedAt = existingInfo.disbursementStartedAt
        ? new Date(existingInfo.disbursementStartedAt).getTime()
        : startedAt;

      if (status === 'COMPLETED') {
        const disbursementTimeTaken = Date.now() - realStartedAt;

        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'DISBURSED',
          isDisbursed: true,
          info: {
            ...existingInfo,
            disbursement,
            disbursementTimeTaken,
            completedAt: new Date().toISOString(),
          },
        });

        this.eventEmitter.emit(EVENTS.TOKEN_DISBURSED, { groupUuid });

        this.logger.log(
          `${tag} COMPLETED -> token ${token.uuid} DISBURSED after ${disbursementTimeTaken}ms`
        );
        return;
      }

      if (status === 'FAILED' || status === 'ERROR') {
        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'FAILED',
          isDisbursed: false,
          info: {
            ...existingInfo,
            disbursement,
            error: `SDP disbursement ${status}`,
            failedAt: new Date().toISOString(),
          },
        });

        this.logger.error(`${tag} ${status} -> token ${token.uuid} FAILED`);
        return;
      }

      // Still in progress — re-queue if within timeout
      const elapsed = Date.now() - startedAt;
      if (elapsed > STATUS_CHECK_TIMEOUT_MS) {
        this.logger.error(`${tag} timed out after 24h -> token ${token.uuid} FAILED`);

        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'FAILED',
          isDisbursed: false,
          info: {
            ...existingInfo,
            disbursement,
            error: 'Disbursement timed out after 24 hours',
            failedAt: new Date().toISOString(),
          },
        });
        return;
      }

      const delay = nextCheckDelay(poll + 1);
      this.logger.log(
        `${tag} still ${status}, re-checking in ${delay / 1000}s (elapsed ${Math.round(
          elapsed / 1000
        )}s)`
      );

      await this.stellarSdpQueue.add(
        JOBS.STELLAR_SDP.DISBURSEMENT_STATUS_UPDATE,
        { disbursementId, groupUuid, startedAt, poll: poll + 1 },
        {
          delay,
          attempts: 3,
          removeOnComplete: true,
          backoff: { type: 'exponential', delay: 5000 },
        }
      );
    } catch (error) {
      this.logger.error(
        `${tag} error checking status: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }
}

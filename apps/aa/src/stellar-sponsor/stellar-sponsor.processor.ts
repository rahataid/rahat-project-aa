import { Inject, Injectable, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Keypair } from '@stellar/stellar-sdk';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { PrismaService } from '@rumsan/prisma';
import { StellarClient } from '@rahataid/stellar';
import { BQUEUE, CORE_MODULE, JOBS, STELLAR_CLIENT } from '../constants';

interface SponsorBatchJobData {
  groupUuid: string;
  beneficiaries: { beneficiaryId: string; walletAddress: string }[];
}

@Processor(BQUEUE.STELLAR_SPONSOR)
@Injectable()
export class StellarSponsorProcessor {
  private readonly logger = new Logger(StellarSponsorProcessor.name);

  constructor(
    @Inject(STELLAR_CLIENT) private readonly stellarClient: StellarClient,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly prisma: PrismaService
  ) {}

  @Process({ name: JOBS.STELLAR.SPONSOR_ACCOUNTS_BATCH, concurrency: 1 })
  async sponsorAccountsBatch(job: Job<SponsorBatchJobData>) {
    const { groupUuid, beneficiaries } = job.data;
    this.logger.log(`[Job ${job.id}] Processing batch of ${beneficiaries.length} beneficiaries for group ${groupUuid}`);

    const walletAddresses = beneficiaries.map((b) => b.walletAddress);
    this.logger.log(`[Job ${job.id}] Fetching secrets for ${walletAddresses.length} wallet(s)`);
    const walletDetails: { address: string; privateKey: string }[] = await lastValueFrom(
      this.client.send(
        { cmd: JOBS.WALLET.GET_BULK_SECRET_BY_WALLET },
        { walletAddresses, chain: 'stellar' }
      )
    );
    this.logger.log(`[Job ${job.id}] Received ${walletDetails.length} secret(s)`);

    const secretByWallet = new Map(walletDetails.map((w) => [w.address, w.privateKey]));
    const resolved = beneficiaries.filter((b) => secretByWallet.has(b.walletAddress));
    if (resolved.length < beneficiaries.length) {
      this.logger.warn(`[Job ${job.id}] ${beneficiaries.length - resolved.length} beneficiary wallet(s) had no secret — skipping them`);
    }
    const keypairs = resolved.map((b) => Keypair.fromSecret(secretByWallet.get(b.walletAddress) as string));

    this.logger.log(`[Job ${job.id}] Submitting sponsored account creation for ${keypairs.length} keypair(s)`);
    const result = await this.stellarClient.createSponsoredAccountsBatch(keypairs);
    this.logger.log(`[Job ${job.id}] Sponsorship tx submitted: ${result.hash}`);

    const uuids = resolved.map((b) => b.beneficiaryId);
    const records = await this.prisma.beneficiary.findMany({ where: { uuid: { in: uuids } } });
    const byUuid = new Map(records.map((r) => [r.uuid, r]));

    this.logger.log(`[Job ${job.id}] Updating ${uuids.length} beneficiary record(s) in DB`);
    await Promise.all(
      uuids.map((uuid, idx) => {
        const benf = byUuid.get(uuid);
        if (!benf) {
          this.logger.warn(`[Job ${job.id}] Beneficiary ${uuid} not found in DB — skipping update`);
          return null;
        }
        return this.prisma.beneficiary.update({
          where: { uuid },
          data: {
            extras: {
              ...((benf.extras as object) ?? {}),
              stellarSponsored: true,
              stellarPublicKey: keypairs[idx].publicKey(),
            },
          },
        });
      })
    );

    this.logger.log(`[Job ${job.id}] Batch complete — sponsored ${resolved.length} account(s) for group ${groupUuid} (tx ${result.hash})`);
  }
}

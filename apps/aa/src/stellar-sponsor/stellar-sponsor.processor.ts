import { Inject, Injectable, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Keypair } from '@stellar/stellar-sdk';
import { PrismaService } from '@rumsan/prisma';
import { StellarClient } from '@rahataid/stellar';
import { BQUEUE, JOBS, STELLAR_CLIENT } from '../constants';

interface SponsorBatchJobData {
  groupUuid: string;
  beneficiaries: { beneficiaryId: string; walletAddress: string; secret: string }[];
}

@Processor(BQUEUE.STELLAR_SPONSOR)
@Injectable()
export class StellarSponsorProcessor {
  private readonly logger = new Logger(StellarSponsorProcessor.name);

  constructor(
    @Inject(STELLAR_CLIENT) private readonly stellarClient: StellarClient,
    private readonly prisma: PrismaService
  ) {}

  @Process({ name: JOBS.STELLAR.SPONSOR_ACCOUNTS_BATCH, concurrency: 1 })
  async sponsorAccountsBatch(job: Job<SponsorBatchJobData>) {
    const { groupUuid, beneficiaries } = job.data;
    const keypairs = beneficiaries.map((b) => Keypair.fromSecret(b.secret));

    const result = await this.stellarClient.createSponsoredAccountsBatch(keypairs);

    const uuids = beneficiaries.map((b) => b.beneficiaryId);
    const records = await this.prisma.beneficiary.findMany({ where: { uuid: { in: uuids } } });
    const byUuid = new Map(records.map((r) => [r.uuid, r]));

    await Promise.all(
      uuids.map((uuid, idx) => {
        const benf = byUuid.get(uuid);
        if (!benf) return null;
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

    this.logger.log(
      `Sponsored ${beneficiaries.length} accounts for group ${groupUuid} (tx ${result.hash})`
    );
  }
}

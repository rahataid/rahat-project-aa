// Run in 'dry' mode before 'live' mode
import { Process, Processor } from '@nestjs/bull';
import { Logger, Injectable, Inject } from '@nestjs/common';
import { BQUEUE, CORE_MODULE, JOBS } from '../constants';
import { StellarService } from '../stellar/stellar.service';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { PrismaService } from '@rumsan/prisma';
import { Job } from 'bull';

type NotFoundBen = {
  walletAddress: string;
  uuid: string;
};

type NoTrustlineBen = {
  walletAddress: string;
  secretKey: string;
};

type CheckBulkTrustlineDto = {
  mode: 'dry' | 'live';
};

@Processor(BQUEUE.STELLAR_CHECK_TRUSTLINE)
@Injectable()
export class CheckTrustlineProcessor {
  private readonly logger = Logger;

  constructor(
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly stellarService: StellarService,
    private readonly prisma: PrismaService
  ) {}

  @Process({ name: JOBS.STELLAR.CHECK_BULK_TRUSTLINE_QUEUE, concurrency: 1 })
  async checkBulkTrustline(job: Job<CheckBulkTrustlineDto>) {
    const { mode } = job.data;

    this.logger.log(
      `Check bulk trustline job started in ${mode} mode`,
      CheckTrustlineProcessor.name
    );

    const beneficiaries = await this.prisma.beneficiary.findMany({
      where: {
        deletedAt: null,
      },
    });

    if (!beneficiaries.length) {
      this.logger.warn('No beneficiaries found');
      return;
    }

    const walletAndUuid = beneficiaries.map((beneficiary) => ({
      walletAddress: beneficiary.walletAddress,
      uuid: beneficiary.uuid,
    }));

    let notFoundBen: NotFoundBen[] = [];
    let noTrustlineBen: NoTrustlineBen[] = [];

    await Promise.all(
      walletAndUuid.map(async (wallet) => {
        this.logger.log(
          `Checking secret for walletAddress: ${wallet.walletAddress}`
        );
        const secret = await this.stellarService.getSecretByWallet(
          wallet.walletAddress
        );
        if (!secret) {
          this.logger.error(
            `Secret not found for walletAddress: ${wallet.walletAddress}`
          );
          notFoundBen.push({
            walletAddress: wallet.walletAddress,
            uuid: wallet.uuid,
          });
          return;
        }
        this.logger.log(
          `Wallet for ${wallet.uuid} found: ${secret.address}, checking trustline`
        );
        const result = await this.stellarService.checkTrustline({
          walletAddress: secret.address,
        });

        if (!result) {
          this.logger.error(
            `Trustline not found for walletAddress: ${wallet.walletAddress}`
          );
          noTrustlineBen.push({
            walletAddress: secret.address,
            secretKey: secret.privateKey,
          });
          return;
        }
        this.logger.log(
          `Trustline found for walletAddress: ${wallet.walletAddress}`
        );
      })
    );

    // Stop updating db if mode is not live
    if (mode != 'live') {
      if (notFoundBen.length > 0) {
        this.logger.warn('Beneficiaries without wallet: ');
        notFoundBen.forEach((ben) => {
          this.logger.warn(
            `Beneficiary: ${ben.uuid}, walletAddress: ${ben.walletAddress}`
          );
        });
      }
      if (noTrustlineBen.length > 0) {
        this.logger.warn('Beneficiaries with wallet but without trustline: ');
        noTrustlineBen.forEach((ben) => {
          this.logger.warn(`Beneficiary: ${ben.walletAddress}`);
        });
      }
      this.logger.log(
        `Dry run check completed, found ${notFoundBen.length} beneficiaries without wallet and ${noTrustlineBen.length} beneficiaries without trustline`
      );
      return;
    }

    if (notFoundBen.length > 0) {
      this.logger.log(
        `Creating and updating wallet address for ${notFoundBen.length} beneficiaries`
      );
      const res = await lastValueFrom(
        this.client.send(
          { cmd: 'rahat.jobs.wallet.updateBulk' },
          {
            chain: 'stellar',
            benUuids: notFoundBen.map((ben) => ben.uuid),
          }
        )
      );
      this.logger.log(
        `Updated wallet address for ${res.length} beneficiaries in Rahat core`
      );

      await Promise.all(
        res.map(async (ben) => {
          this.logger.log(
            `Updating wallet address for ${ben.uuid} in AA project`
          );
          await this.prisma.beneficiary.update({
            where: {
              uuid: ben.uuid,
            },
            data: {
              walletAddress: ben.walletAddress,
            },
          });
          noTrustlineBen.push({
            walletAddress: ben.walletAddress,
            secretKey: ben.secret,
          });
        })
      );

      this.logger.log(
        `Updated wallet address for ${res.length} beneficiaries in AA project`
      );
    }

    if (noTrustlineBen.length > 0) {
      await Promise.all(
        noTrustlineBen.map(async (ben) => {
          this.logger.log(`Adding trustline for ${ben.walletAddress}`);
          await this.stellarService.faucetAndTrustlineService({
            walletAddress: ben.walletAddress,
            secretKey: ben.secretKey,
          });
        })
      );
      this.logger.log(
        `Added trustline for ${noTrustlineBen.length} beneficiaries in AA project`
      );
    }
  }
}

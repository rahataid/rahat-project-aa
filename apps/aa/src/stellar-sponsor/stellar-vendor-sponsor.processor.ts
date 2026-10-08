import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Keypair } from '@stellar/stellar-sdk';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { StellarClient } from '@rahataid/stellar';
import { BQUEUE, CORE_MODULE, JOBS, STELLAR_CLIENT } from '../constants';

// ponytail: fixed float; move to settings if it ever needs tuning per network
const VENDOR_FEE_XLM = '0.1';

@Processor(BQUEUE.STELLAR_VENDOR_SPONSOR)
@Injectable()
export class StellarVendorSponsorProcessor {
  private readonly logger = new Logger(StellarVendorSponsorProcessor.name);

  constructor(
    @Inject(STELLAR_CLIENT) private readonly stellarClient: StellarClient,
    @Inject(CORE_MODULE) private readonly client: ClientProxy
  ) {}

  /**
   * Vendor onboarding: sponsor-created account + sponsor-paid trustline (a no-op if both already
   * exist), then 0.1 XLM for the vendor's own tx fees. The XLM is sent only after the sponsorship
   * tx is confirmed, so the account exists by then. Concurrency 1 serializes vendors so the
   * sponsor account's sequence numbers don't collide; failed attempts are retried by Bull.
   */
  @Process({ name: JOBS.STELLAR.SPONSOR_VENDOR, concurrency: 1 })
  async sponsorVendor(job: Job<{ walletAddress: string }>) {
    const { walletAddress } = job.data;
    const logPrefix = `[Job ${job.id}][vendor ${walletAddress}]`;

    const wallets: { address: string; privateKey: string }[] = await lastValueFrom(
      this.client.send(
        { cmd: JOBS.WALLET.GET_BULK_SECRET_BY_WALLET },
        { walletAddresses: [walletAddress], chain: 'stellar' }
      )
    );
    const secret = wallets.find((w) => w.address === walletAddress)?.privateKey;
    if (!secret) throw new Error(`No wallet secret found for vendor ${walletAddress}`);

    const sponsored = await this.stellarClient.createSponsoredAccountsBatch([Keypair.fromSecret(secret)]);
    this.logger.log(`${logPrefix} Account + trustline: ${sponsored.accounts[0].action}, tx ${sponsored.hash ?? 'none'}`);

    const funded = await this.stellarClient.fundAccountWithXlm(walletAddress, VENDOR_FEE_XLM);
    this.logger.log(`${logPrefix} Sent ${VENDOR_FEE_XLM} XLM, tx ${funded.hash}`);
  }

  @OnQueueFailed()
  onFailed(job: Job<{ walletAddress: string }>, error: Error) {
    this.logger.error(
      `[Job ${job.id}][vendor ${job.data.walletAddress}] attempt ${job.attemptsMade}/${job.opts.attempts ?? 1} FAILED: ${error.message}`,
      error.stack
    );
  }
}

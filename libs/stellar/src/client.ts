import { Asset, Horizon, Keypair } from '@stellar/stellar-sdk';
import { resolveNetwork } from './utils/network';
import * as accountUtils from './utils/account';
import { createSponsoredAccount, createSponsoredAccountsBatch } from './operations/account';
import { sendFromSponsored, sendToSponsored } from './operations/payment';
import {
  CreateSponsoredAccountResult,
  CreateSponsoredAccountsBatchResult,
  PaymentResult,
  StellarClientConfig,
} from './types';

/**
 * Core Stellar client for sponsored-account operations. Construct once with
 * the network, sponsor secret, and asset configuration - every method then
 * builds, signs, and submits the underlying transaction.
 */
export class StellarClient {
  readonly config: StellarClientConfig;
  readonly server: Horizon.Server;
  readonly networkPassphrase: string;
  readonly horizonUrl: string;
  readonly asset: Asset;
  private readonly sponsorKeypair: Keypair;

  constructor(config: StellarClientConfig) {
    this.config = config;

    const { server, networkPassphrase, horizonUrl } = resolveNetwork(config);
    this.server = server;
    this.networkPassphrase = networkPassphrase;
    this.horizonUrl = horizonUrl;

    this.asset = new Asset(config.assetCode, config.assetIssuer);
    this.sponsorKeypair = Keypair.fromSecret(config.sponsorSecret);
  }

  get sponsorPublicKey(): string {
    return this.sponsorKeypair.publicKey();
  }

  private get opContext() {
    return {
      server: this.server,
      networkPassphrase: this.networkPassphrase,
      sponsorKeypair: this.sponsorKeypair,
      asset: this.asset,
    };
  }

  /** Creates a new account with 0 XLM and a trustline, fully sponsored. */
  async createSponsoredAccount(): Promise<CreateSponsoredAccountResult> {
    return createSponsoredAccount(this.opContext);
  }

  /** Creates up to MAX_ACCOUNTS_PER_BATCH sponsored accounts in a single transaction. */
  async createSponsoredAccountsBatch(count: number): Promise<CreateSponsoredAccountsBatchResult> {
    return createSponsoredAccountsBatch(this.opContext, count);
  }

  /** Sponsor sends the configured asset to a sponsored account. */
  async sendToSponsored(destinationPublicKey: string, amount: string): Promise<PaymentResult> {
    return sendToSponsored(this.opContext, destinationPublicKey, amount);
  }

  /** A sponsored account sends the configured asset onward; the sponsor pays the fee. */
  async sendFromSponsored(
    sponsoredSecret: string,
    destinationPublicKey: string,
    amount: string
  ): Promise<PaymentResult> {
    return sendFromSponsored(this.opContext, sponsoredSecret, destinationPublicKey, amount);
  }

  async accountExists(publicKey: string): Promise<boolean> {
    return accountUtils.accountExists(this.server, publicKey);
  }

  async hasTrustline(publicKey: string): Promise<boolean> {
    return accountUtils.hasTrustline(this.server, publicKey, this.config.assetCode, this.config.assetIssuer);
  }

  async getBalance(publicKey: string): Promise<string> {
    return accountUtils.getBalance(this.server, publicKey, this.config.assetCode, this.config.assetIssuer);
  }

  async getNativeBalance(publicKey: string): Promise<string> {
    return accountUtils.getNativeBalance(this.server, publicKey);
  }
}

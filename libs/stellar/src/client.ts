import { Asset, Horizon, Keypair } from '@stellar/stellar-sdk';
import { resolveNetwork } from './utils/network';
import * as accountUtils from './utils/account';
import { createSponsoredAccount, createSponsoredAccountsBatch, mergeSponsoredAccountsBatch } from './operations/account';
import { sendFromSponsored, sendFromSponsoredBatch, sendPayment, sendToSponsored } from './operations/payment';
import { fundAccountWithXlm } from './operations/fundAccount';
import {
  CreateSponsoredAccountResult,
  CreateSponsoredAccountsBatchResult,
  MergeSponsoredAccountsBatchResult,
  PaymentResult,
  SendFromSponsoredBatchResult,
  SponsoredBatchTransferItem,
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

  //TODO: consider sender horizon urls as well
  constructor(config: StellarClientConfig) {
    this.config = config;

    const { server, networkPassphrase, horizonUrl } = resolveNetwork(config);
    this.server = server;
    this.networkPassphrase = networkPassphrase;
    this.horizonUrl = horizonUrl;

    this.asset = new Asset(config.assetCode, config.assetIssuer);
    this.sponsorKeypair = Keypair.fromSecret(config.sponsorSecret);
    console.log('StellarClient initialized with config:', config);
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
  async createSponsoredAccountsBatch(keypairs: Keypair[]): Promise<CreateSponsoredAccountsBatchResult> {
    return createSponsoredAccountsBatch(this.opContext, keypairs);
  }

  /**
   * Closes out up to MAX_ACCOUNTS_PER_MERGE_BATCH accounts entirely: closes
   * each one's trustline (if open) and merges the account into the sponsor,
   * deleting it from the ledger. One-way door — pass each beneficiary's own
   * keypair, since they must co-sign. See mergeSponsoredAccountsBatch's
   * doc comment in operations/account.ts for the full rationale.
   */
  async mergeSponsoredAccountsBatch(keypairs: Keypair[]): Promise<MergeSponsoredAccountsBatchResult> {
    return mergeSponsoredAccountsBatch(this.opContext, keypairs);
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

  /** Combines up to MAX_TRANSFERS_PER_BATCH sponsored payments into a single sponsor-signed transaction. */
  async sendFromSponsoredBatch(items: SponsoredBatchTransferItem[]): Promise<SendFromSponsoredBatchResult> {
    return sendFromSponsoredBatch(this.opContext, items);
  }

  /**
   * A plain, non-sponsored send: the sender pays its own fee and is the
   * sole signer. Works for any asset, including native XLM (Asset.native()).
   */
  async sendPayment(
    senderSecret: string,
    destinationPublicKey: string,
    asset: Asset,
    amount: string
  ): Promise<PaymentResult> {
    return sendPayment(
      { server: this.server, networkPassphrase: this.networkPassphrase },
      senderSecret,
      destinationPublicKey,
      asset,
      amount
    );
  }

  /** Fund `destination` with XLM from the sponsor; creates the account if it doesn't exist. */
  async fundAccountWithXlm(destination: string, amount: string): Promise<PaymentResult> {
    return fundAccountWithXlm(
      { server: this.server, networkPassphrase: this.networkPassphrase, sponsorKeypair: this.sponsorKeypair },
      destination,
      amount
    );
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

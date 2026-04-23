// apps/aa/src/processors/evm-redeem-inkind.processor.ts
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { Job, Queue } from 'bull';
import { ethers } from 'ethers';
import { BQUEUE, JOBS } from '../constants';
import { InkindsService } from '../inkinds';
import { ModuleRef } from '@nestjs/core';
import { RedlockService } from '../shared/services/redlock.service';

const AAProjectABI = require('../contracts/abis/AAProject.json');

@Processor(BQUEUE.EVM_REDEEM_INKIND)
@Injectable()
export class EVMRedeemInkindProcessor {
  private readonly logger = new Logger(EVMRedeemInkindProcessor.name);
  private provider!: ethers.Provider;
  private signer!: ethers.Signer;
  private isInitialized = false;
  private _inkindService: InkindsService | null = null;

  constructor(
    @InjectQueue(BQUEUE.EVM_REDEEM_INKIND)
    private readonly redeemInkindQueue: Queue,
    private readonly prismaService: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly redlockService: RedlockService
  ) {
    this.initializeProvider();
  }

  private get inkindService(): InkindsService {
    if (!this._inkindService) {
      this._inkindService = this.moduleRef.get(InkindsService, {
        strict: false,
      });
    }
    return this._inkindService!;
  }

  private async initializeProvider() {
    try {
      const chainConfig = await this.getFromSettings('CHAIN_SETTINGS');
      const deployerPrivateKey = await this.getFromSettings(
        'DEPLOYER_PRIVATE_KEY'
      );

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
      throw new Error('EVM provider not initialized');
    }
  }

  @Process({ name: JOBS.EVM.REDEEM_INKIND, concurrency: 1 })
  async redeemInKind(
    job: Job<{
      beneficiaryAddress: string;
      vendorAddress: string;
      inkinds: string[];
    }>
  ) {
    try {
      await this.ensureInitialized();

      const { inkinds, beneficiaryAddress, vendorAddress } = job.data;

      const inkindTokenContract = await this.createContractInstanceSign(
        'INKINDTOKEN',
        null,
        this.signer
      );

      const currentDecimalValue = await inkindTokenContract.decimals
        .staticCall()
        .then((decimals) => {
          return decimals;
        })
        .catch((error) => {
          this.logger.error(
            `[Job ${job.id}] Error fetching INKINDTOKEN decimals: ${error.message}`,
            error.stack,
            EVMRedeemInkindProcessor.name
          );
          return 18;
        });

      const inkindsValue = ethers.parseUnits(
        `${inkinds.length}`,
        currentDecimalValue
      );

      let txHash;
      const inkindContract = await this.createContractInstanceSign(
        'INKIND',
        null,
        this.signer
      );

      const convertedInkindUuid = inkinds.map((uuid) =>
        ethers.hexlify(ethers.toBeArray('0x' + uuid.replace(/-/g, '')))
      );

      try {
        const signerAddress = await this.signer.getAddress();

        // Use Redis Redlock for distributed lock across concurrent job workers
        const inkindTxHash = await this.redlockService.acquireLock(
          `evm:nonce:${signerAddress}`,
          async () => {
            const [pendingNonce, confirmedNonce] = await Promise.all([
              this.provider.getTransactionCount(signerAddress, 'pending'),
              this.provider.getTransactionCount(signerAddress, 'latest'),
            ]);

            this.logger.log(
              `[Job ${job.id}] Submitting transaction with nonce ${pendingNonce} (confirmed: ${confirmedNonce}, pending: ${pendingNonce})`,
              EVMRedeemInkindProcessor.name
            );

            const tx = await inkindContract.redeemInkind(
              convertedInkindUuid,
              vendorAddress,
              beneficiaryAddress,
              inkindsValue,
              { nonce: pendingNonce }
            );

            this.logger.log(
              `[Job ${job.id}] Transaction submitted: ${tx.hash}, waiting for 2 confirmations...`,
              EVMRedeemInkindProcessor.name
            );

            return await tx.wait(2);
          },
          600000 // 10 minute lock duration to accommodate blockchain confirmations
        );

        this.logger.log(
          `[Job ${job.id}] Inkind redeemed successfully. Transaction: ${inkindTxHash.hash} (block ${inkindTxHash.blockNumber})`,
          EVMRedeemInkindProcessor.name
        );
        txHash = inkindTxHash.hash;

        await this.inkindService.updateRedeemInkindTxHash(
          inkinds,
          txHash,
          beneficiaryAddress
        );
      } catch (error) {
        const code: string = error?.code ?? '';
        const isNonceError =
          code === 'REPLACEMENT_UNDERPRICED' ||
          code === 'NONCE_EXPIRED' ||
          error?.message?.includes('replacement transaction underpriced') ||
          error?.message?.includes('nonce has already been used');

        if (isNonceError) {
          this.logger.warn(
            `[Job ${job.id}] Nonce collision on (${code}). ` +
              `A previous tx for this job may still be pending or already mined. ` +
              `Bull will retry with backoff.`,
            EVMRedeemInkindProcessor.name
          );
        } else {
          this.logger.error(
            `[Job ${job.id}] Unexpected error in EVM redeem inkind: ${error.message}`,
            error.stack,
            EVMRedeemInkindProcessor.name
          );
        }
        throw error;
      }
    } catch (error) {
      this.logger.error(
        `[Job ${job.id}] Error in EVM redeem inkind: ${error.message}`,
        error.stack,
        EVMRedeemInkindProcessor.name
      );
      throw error;
    }
  }

  private async getFromSettings(key: string): Promise<any> {
    try {
      const settings = await this.prismaService.setting.findUnique({
        where: {
          name: key,
        },
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

  private async createContractInstanceSign(
    contractName: any,
    abi?: any,
    signer?: ethers.Signer
  ) {
    const contract = await this.getFromSettings('CONTRACT');
    const contractSigner = signer || this.signer;

    let contractAddress: string;
    let contractABI: any;

    if (contractName === 'INKIND') {
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
      throw new Error(`Invalid ABI format: ${error.message}`);
    }
  }
}

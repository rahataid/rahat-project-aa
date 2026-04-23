// apps/aa/src/processors/evm-redeem-inkind.processor.ts
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { Job, Queue } from 'bull';
import { ethers } from 'ethers';
import { BQUEUE, JOBS } from '../constants';
import { InkindsService } from '../inkinds';
import { ModuleRef } from '@nestjs/core';

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
    private readonly moduleRef: ModuleRef
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
      // STEP 1: [INITIALIZE] Initialize provider for contract
      await this.ensureInitialized();
      const { inkinds, beneficiaryAddress, vendorAddress } = job.data;

      // STEP 1.1: Create contract instance
      const inkindTokenContract = await this.createContractInstanceSign(
        'INKINDTOKEN',
        null,
        this.signer
      );

      // STEP 2: [SETUP] Setup transaction parameters (Ether value and gas limit)
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

      // STEP 2.2: Convert inkind UUIDs to bytes32 format and calculate total inkinds value
      const inkindsValue = ethers.parseUnits(
        `${inkinds.length}`,
        currentDecimalValue
      );

      // STEP 2.3: Convert inkind UUIDs to bytes32 format
      const convertedInkindUuid = inkinds.map((uuid) =>
        ethers.hexlify(ethers.toBeArray('0x' + uuid.replace(/-/g, '')))
      );

      // STEP 2.4: Get current nonce for the transaction
      const [pendingNonce, confirmedNonce] = await Promise.all([
        this.provider.getTransactionCount(
          await this.signer.getAddress(),
          'pending'
        ),
        this.provider.getTransactionCount(
          await this.signer.getAddress(),
          'latest'
        ),
      ]);

      // STEP 3: [SIGN] Sign the transaction and prepare for submission
      let txHash;
      const inkindContract = await this.createContractInstanceSign(
        'INKIND',
        null,
        this.signer
      );

      this.logger.log(
        `[Job ${job.id}] Submitting transaction with nonce ${pendingNonce} (confirmed: ${confirmedNonce}, pending: ${pendingNonce})`,
        EVMRedeemInkindProcessor.name
      );

      // STEP 4: [REDEEM] Redeem the inkind by calling the contract method
      const tx = await inkindContract.redeemInkind(
        convertedInkindUuid,
        vendorAddress,
        beneficiaryAddress,
        inkindsValue,
        { nonce: pendingNonce }
      );

      this.logger.log(
        `[Job ${job.id}] Transaction submitted: ${tx.hash}`,
        EVMRedeemInkindProcessor.name
      );

      // STEP 5: [CONFIRM] Wait for the transaction to be confirmed on the blockchain
      const inkindTxHash = await tx.wait();

      this.logger.log(
        `[Job ${job.id}] Inkind redeemed successfully. Transaction: ${inkindTxHash.hash} (block ${inkindTxHash.blockNumber})`,
        EVMRedeemInkindProcessor.name
      );

      // STEP 6: [UPDATE] Update the inkind records in the database with the transaction hash
      txHash = inkindTxHash.hash;

      // Update the inkind records in the database with the transaction hash
      await this.inkindService.updateRedeemInkindTxHash(
        inkinds,
        txHash,
        beneficiaryAddress
      );
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

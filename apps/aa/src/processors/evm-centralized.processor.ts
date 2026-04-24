import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { Job, Queue } from 'bull';
import { ethers } from 'ethers';
import { BQUEUE, CORE_MODULE, EVENTS, JOBS } from '../constants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { InkindsService } from '../inkinds';
import { ModuleRef } from '@nestjs/core';
import { lastValueFrom } from 'rxjs';

const AAProjectABI = require('../contracts/abis/AAProject.json');
const TriggerManagerABI = require('../contracts/abis/TriggerManager.json');

interface EVMStatusUpdateJob {
  txHash: string;
  groupUuid: string;
  beneficiaries: string[];
  amounts: string[];
  identifier: string;
  batchNumber: number;
  totalBatches: number;
}

@Injectable()
export class EVMCentralizedProcessor {
  private readonly logger = new Logger(EVMCentralizedProcessor.name);

  private provider!: ethers.Provider;
  private signer!: ethers.Signer;
  private isInitialized = false;
  private _inkindService: InkindsService | null = null;

  constructor(
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly beneficiaryService: BeneficiaryService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(BQUEUE.EVM_TX) private readonly evmTxQueue: Queue,
    @InjectQueue(BQUEUE.EVM_QUERY) private readonly evmQueryQueue: Queue,
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
      throw new RpcException('EVM provider not initialized');
    }
  }

  // ===== JOB HANDLERS =====

  async handleAssignTokens(job: Job<{ groups: string }>): Promise<any> {
    const { groups } = job.data;
    const BATCH_SIZE = 10;

    try {
      this.logger.log('Processing EVM assign tokens...', EVMCentralizedProcessor.name);
      await this.ensureInitialized();

      const aaContract = await this.createContractInstanceSign(
        'AAPROJECT',
        AAProjectABI,
        this.signer
      );

      const benGroups =
        (groups && groups.length) > 0
          ? groups
          : await this.getDisbursableGroupsUuids();

      this.logger.log('Token Disburse for: ', groups);
      const bens = await this.getBeneficiaryTokenBalance([
        benGroups,
      ] as string[]);

      if (!bens || bens.length === 0) {
        throw new RpcException('Beneficiary Token Balance not found');
      }

      const multicallTxnPayload = [];

      const contract = await this.getFromSettings('CONTRACT');
      const formatedAbi = this.lowerCaseObjectKeys(contract.RAHATTOKEN.ABI);

      const chainConfig = await this.getFromSettings('CHAIN_SETTINGS');

      const rpcUrl = chainConfig.rpcUrl;
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      const rahatTokenContract = new ethers.Contract(
        contract.RAHATTOKEN.ADDRESS,
        formatedAbi,
        provider
      );

      const decimal = await rahatTokenContract.decimals.staticCall();

      for (const benf of bens) {
        console.log('benf', benf);
        if (benf.amount) {
          const formattedAmountBn = ethers.parseUnits(
            benf.amount.toString(),
            decimal
          );

          multicallTxnPayload.push([benf.walletAddress, formattedAmountBn]);
        }
      }

      let totalTokens: number = 0;
      bens?.forEach((ben) => {
        this.logger.log(`Beneficiary: ${ben.walletAddress} has ${ben.amount}`);
        totalTokens += parseInt(ben.amount);
      });

      const transactionHashes: string[] = [];
      const totalBeneficiaries = multicallTxnPayload.length;
      const numberOfBatches = Math.ceil(totalBeneficiaries / BATCH_SIZE);

      this.logger.log(
        `Processing ${totalBeneficiaries} beneficiaries in ${numberOfBatches} batches of ${BATCH_SIZE}`,
        EVMCentralizedProcessor.name
      );

      for (let i = 0; i < numberOfBatches; i++) {
        const startIndex = i * BATCH_SIZE;
        const endIndex = Math.min(startIndex + BATCH_SIZE, totalBeneficiaries);
        const batchPayload = multicallTxnPayload.slice(startIndex, endIndex);

        this.logger.log(
          `Processing batch ${i + 1}/${numberOfBatches} with ${
            batchPayload.length
          } beneficiaries`,
          EVMCentralizedProcessor.name
        );

        try {
          const assignTokenToBeneficiary = await this.multiSend(
            aaContract,
            'assignTokenToBeneficiary',
            batchPayload
          );

          transactionHashes.push(assignTokenToBeneficiary.hash);

          this.logger.log(
            `Batch ${i + 1} completed with txn hash: ${
              assignTokenToBeneficiary.hash
            }`,
            EVMCentralizedProcessor.name
          );

          if (i < numberOfBatches - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        } catch (batchError) {
          this.logger.error(
            `Error in batch ${i + 1}: ${batchError.message}`,
            batchError.stack,
            EVMCentralizedProcessor.name
          );

          await this.beneficiaryService.updateGroupToken({
            groupUuid: Array.isArray(groups) ? groups[0] : groups,
            status: 'FAILED',
            isDisbursed: false,
            info: {
              error: `Batch ${i + 1} failed: ${batchError.message}`,
              stack: batchError.stack,
              completedBatches: i,
              totalBatches: numberOfBatches,
            },
          });

          throw batchError;
        }
      }

      await this.beneficiaryService.updateGroupToken({
        groupUuid: Array.isArray(groups) ? groups[0] : groups,
        status: 'STARTED',
        isDisbursed: false,
        info: {
          transactionHashes,
          totalBatches: numberOfBatches,
          totalBeneficiaries,
        },
      });

      for (let i = 0; i < transactionHashes.length; i++) {
        const txHash = transactionHashes[i];
        const startIndex = i * BATCH_SIZE;
        const endIndex = Math.min(startIndex + BATCH_SIZE, totalBeneficiaries);
        const batchBeneficiaries = bens.slice(startIndex, endIndex);

        this.evmQueryQueue.add(
          {
            type: JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE,
            txHash,
            groupUuid: Array.isArray(groups) ? groups[0] : groups,
            beneficiaries: batchBeneficiaries.map((ben) => ben.walletAddress),
            amounts: batchBeneficiaries.map((ben) => ben.amount),
            identifier: `disbursement_batch_${i + 1}_${Date.now()}`,
            batchNumber: i + 1,
            totalBatches: numberOfBatches,
          },
          {
            delay: 0.2 * 60 * 1000,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          }
        );
      }

      this.logger.log(
        `Successfully processed all ${numberOfBatches} batches for group ${
          Array.isArray(groups) ? groups[0] : groups
        } with ${transactionHashes.length} transactions`,
        EVMCentralizedProcessor.name
      );
    } catch (error) {
      await this.beneficiaryService.updateGroupToken({
        groupUuid: Array.isArray(groups) ? groups[0] : groups,
        status: 'FAILED',
        isDisbursed: false,
        info: {
          error: error.message,
          stack: error.stack,
        },
      });

      this.logger.error(
        `Error in EVM assign tokens: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw error;
    }
  }

  async handleStatusUpdate(job: Job<EVMStatusUpdateJob>): Promise<any> {
    try {
      this.logger.log(
        'Processing EVM disbursement status update...',
        EVMCentralizedProcessor.name
      );

      await this.ensureInitialized();
      const {
        groupUuid,
        txHash,
        beneficiaries,
        amounts,
        batchNumber,
        totalBatches,
      } = job.data;

      const group =
        await this.beneficiaryService.getOneTokenReservationByGroupId(
          groupUuid
        );

      if (!group) {
        this.logger.error(`Group ${groupUuid} not found`, EVMCentralizedProcessor.name);
        return;
      }

      if (
        new Date(group.updatedAt).getTime() <
        new Date().getTime() - 60 * 60 * 1000
      ) {
        this.logger.log(
          `Group ${groupUuid} updated more than 60 minutes ago, assuming disbursement failed`,
          EVMCentralizedProcessor.name
        );
        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'FAILED',
          isDisbursed: false,
          info: {
            ...(group.info && { ...JSON.parse(JSON.stringify(group.info)) }),
            error: 'Transaction timeout - no confirmation received',
          },
        });
        return;
      }

      try {
        const txReceipt = await this.provider.getTransactionReceipt(txHash);

        if (!txReceipt) {
          this.logger.log(
            `Transaction ${txHash} not yet confirmed, adding another status update job`,
            EVMCentralizedProcessor.name
          );

          this.evmQueryQueue.add(
            { type: JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE, ...job.data },
            {
              delay: 0.2 * 60 * 1000,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
            }
          );
          return;
        }

        if (txReceipt.status === 1) {
          this.logger.log(
            `Transaction ${txHash} confirmed successfully`,
            EVMCentralizedProcessor.name
          );

          if (beneficiaries && amounts && beneficiaries.length > 0) {
            await this.createDisbursementLogsForBatch(
              groupUuid,
              txHash,
              beneficiaries,
              amounts,
              batchNumber,
              totalBatches
            );
          }

          await this.beneficiaryService.updateGroupToken({
            groupUuid,
            status: 'DISBURSED',
            isDisbursed: true,
            info: {
              ...(group.info && { ...JSON.parse(JSON.stringify(group.info)) }),
              txReceipt: {
                blockNumber: txReceipt.blockNumber,
                gasUsed: txReceipt.gasUsed?.toString(),
                status: 'SUCCESS',
              },
            },
          });
          this.eventEmitter.emit(EVENTS.TOKEN_DISBURSED, { groupUuid });
        } else {
          this.logger.log(
            `Transaction ${txHash} failed on blockchain`,
            EVMCentralizedProcessor.name
          );

          await this.beneficiaryService.updateGroupToken({
            groupUuid,
            status: 'FAILED',
            isDisbursed: false,
            info: {
              ...(group.info && { ...JSON.parse(JSON.stringify(group.info)) }),
              error: 'Transaction failed on blockchain',
              txReceipt: {
                blockNumber: txReceipt.blockNumber,
                gasUsed: txReceipt.gasUsed?.toString(),
                status: 'FAILED',
              },
            },
          });
        }
      } catch (error) {
        this.logger.error(
          `Error checking transaction status for ${txHash}: ${error.message}`,
          EVMCentralizedProcessor.name
        );

        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'FAILED',
          isDisbursed: false,
          info: {
            ...(group.info && { ...JSON.parse(JSON.stringify(group.info)) }),
            error: `Error checking transaction status: ${error.message}`,
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Error in EVM disbursement status update: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw error;
    }
  }

  async handleCheckBalance(
    job: Job<{ address: string; tokenAddress: string; projectContract: string }>
  ): Promise<any> {
    try {
      this.logger.log('Processing EVM balance check...', EVMCentralizedProcessor.name);
      await this.ensureInitialized();

      const { address, tokenAddress, projectContract } = job.data;

      const ethBalance = await this.provider.getBalance(address);

      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        this.provider
      );

      const tokenBalance = await tokenContract.balanceOf(address);

      const projectContractInstance = new ethers.Contract(
        projectContract,
        ['function benTokens(address) view returns (uint256)'],
        this.provider
      );

      const projectTokenBalance = await projectContractInstance.benTokens(
        address
      );

      return {
        balances: [
          {
            asset_type: 'native',
            balance: ethers.formatEther(ethBalance),
            asset_code: 'ETH',
            asset_issuer: null,
          },
          {
            asset_type: 'credit_alphanum4',
            balance: ethers.formatUnits(tokenBalance, 18),
            asset_code: 'RAHAT',
            asset_issuer: tokenAddress,
          },
          {
            asset_type: 'credit_alphanum4',
            balance: ethers.formatUnits(projectTokenBalance, 18),
            asset_code: 'PROJECT_TOKENS',
            asset_issuer: projectContract,
          },
        ],
        transactions: [],
      };
    } catch (error) {
      this.logger.error(
        `Error in EVM balance check: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw error;
    }
  }

  async handleFundAccount(
    job: Job<{ walletAddress: string; amount: string }>
  ): Promise<any> {
    try {
      this.logger.log('Processing EVM fund account...', EVMCentralizedProcessor.name);
      await this.ensureInitialized();

      const { walletAddress, amount } = job.data;

      const tx = await this.signer.sendTransaction({
        to: walletAddress,
        value: ethers.parseEther(amount),
      });

      const receipt = await tx.wait();

      this.logger.log(
        `Successfully funded account ${walletAddress} with ${amount} ETH. Transaction: ${receipt?.hash}`,
        EVMCentralizedProcessor.name
      );

      return {
        success: true,
        txHash: receipt?.hash,
        blockNumber: receipt?.blockNumber,
        walletAddress,
        amount,
      };
    } catch (error) {
      this.logger.error(
        `Error in EVM fund account: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw error;
    }
  }

  async handleTransferTokens(
    job: Job<{ from: string; to: string; amount: string }>
  ): Promise<any> {
    try {
      this.logger.log('Processing EVM transfer tokens...', EVMCentralizedProcessor.name);
      await this.ensureInitialized();

      const { from, to, amount } = job.data;

      const chainConfig = await this.getFromSettings('CHAIN_SETTINGS');
      const tokenContract = new ethers.Contract(
        chainConfig.tokenContractAddress,
        [
          'function transfer(address to, uint256 amount) returns (bool)',
          'function balanceOf(address account) view returns (uint256)',
        ],
        this.signer
      );

      const balance = await tokenContract.balanceOf(from);
      const transferAmount = ethers.parseUnits(amount, 18);

      if (balance < transferAmount) {
        throw new Error(
          `Insufficient balance. Required: ${amount}, Available: ${ethers.formatUnits(
            balance,
            18
          )}`
        );
      }

      const tx = await tokenContract.transfer(to, transferAmount);
      const receipt = await tx.wait();

      this.logger.log(
        `Successfully transferred ${amount} tokens from ${from} to ${to}. Transaction: ${receipt?.hash}`,
        EVMCentralizedProcessor.name
      );

      return {
        success: true,
        txHash: receipt?.hash,
        blockNumber: receipt?.blockNumber,
        from,
        to,
        amount,
      };
    } catch (error) {
      this.logger.error(
        `Error in EVM transfer tokens: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw error;
    }
  }

  async handleRedeemInkind(
    job: Job<{
      beneficiaryAddress: string;
      vendorAddress: string;
      inkinds: string[];
    }>
  ): Promise<any> {
    try {
      // Step 1: Initialize - Ensure the EVM provider and signer are ready before any contract calls
      this.logger.log('Processing EVM redeem inkind...', EVMCentralizedProcessor.name);
      await this.ensureInitialized();

      // Step 2: Connect - Get the INKINDTOKEN contract instance bound to the deployer signer
      const inkindTokenContract = await this.createContractInstanceSign(
        'INKINDTOKEN',
        null,
        this.signer
      );

      // Step 3: Fetch - Read the token decimal precision from the contract; fall back to 18 on failure
      const currentDecimalValue = await inkindTokenContract.decimals
        .staticCall()
        .then((decimals) => decimals)
        .catch((error) => {
          this.logger.error(
            `Error fetching INKINDTOKEN decimals: ${error.message}`,
            error.stack,
            EVMCentralizedProcessor.name
          );
          return 18;
        });

      // Step 4: Extract - Pull the redemption payload from the job data
      const { inkinds, beneficiaryAddress, vendorAddress } = job.data;

      // Step 4.1: Scale - Convert the inkind count to the token's decimal unit for the contract call
      const inkindsValue = ethers.parseUnits(
        `${inkinds.length}`,
        currentDecimalValue
      );

      let txHash;

      // Step 5: Connect - Get the INKIND contract instance that exposes the redeemInkind function
      const inkindContract = await this.createContractInstanceSign(
        'INKIND',
        null,
        this.signer
      );

      // Step 6: Convert - Transform human-readable UUIDs into bytes32 hex values expected by the contract
      const convertedInkindUuid = inkinds.map((uuid) =>
        ethers.hexlify(ethers.toBeArray('0x' + uuid.replace(/-/g, '')))
      );

      try {
        // Step 7: Execute - Submit the redeemInkind transaction to the blockchain and wait for confirmation
        const redeemInkind = await inkindContract.redeemInkind(
          convertedInkindUuid,
          vendorAddress,
          beneficiaryAddress,
          inkindsValue
        );
        const inkindTxHash = await redeemInkind.wait();
        this.logger.log(
          `Inkind redeemed successfully. Transaction: ${inkindTxHash.hash}`,
          EVMCentralizedProcessor.name
        );
        txHash = inkindTxHash.hash;

        // Step 8: Persist - Save the confirmed transaction hash against the redeemed inkind records in the DB
        await this.inkindService.updateRedeemInkindTxHash(
          inkinds,
          txHash,
          beneficiaryAddress
        );
      } catch (error) {
        this.logger.error(
          `Error in EVM redeem inkind: ${error.message}`,
          error.stack,
          EVMCentralizedProcessor.name
        );
        throw error;
      }
    } catch (error) {
      this.logger.error(
        `Error in EVM redeem inkind: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw error;
    }
  }

  // ===== HELPER METHODS =====

  private async createDisbursementLogsForBatch(
    groupUuid: string,
    txHash: string,
    beneficiaries: string[],
    amounts: string[],
    batchNumber: number,
    totalBatches: number
  ) {
    try {
      this.logger.log(
        `Creating DisbursementLogs for batch ${batchNumber}/${totalBatches} with ${beneficiaries.length} beneficiaries`,
        EVMCentralizedProcessor.name
      );

      const groupToken =
        await this.beneficiaryService.getOneTokenReservationByGroupId(
          groupUuid
        );

      if (!groupToken) {
        this.logger.error(
          `Group token not found for group ${groupUuid}`,
          EVMCentralizedProcessor.name
        );
        return;
      }

      const disbursementLogs = [];

      for (let i = 0; i < beneficiaries.length; i++) {
        const beneficiaryWalletAddress = beneficiaries[i];
        const amount = amounts[i];

        this.logger.log(
          `Created DisbursementLog for beneficiary ${beneficiaryWalletAddress} with amount ${amount}`,
          EVMCentralizedProcessor.name
        );
      }

      this.logger.log(
        `Successfully created ${disbursementLogs.length} DisbursementLogs records for batch ${batchNumber}`,
        EVMCentralizedProcessor.name
      );

      return disbursementLogs;
    } catch (error) {
      this.logger.error(
        `Error creating DisbursementLogs for batch ${batchNumber}: ${error.message}`,
        error.stack,
        EVMCentralizedProcessor.name
      );
      throw error;
    }
  }

  private async getFromSettings(key: string): Promise<any> {
    try {
      const settings = await this.prismaService.setting.findUnique({
        where: { name: key },
      });

      console.log('settings', settings);

      if (!settings?.value) {
        throw new Error(`${key} not found`);
      }

      return settings.value;
    } catch (error) {
      this.logger.error(`Error getting setting ${key}:`, error);
      throw error;
    }
  }

  private async multiSend(
    contract: ethers.Contract,
    functionName: string,
    callData: string[] | string[][]
  ) {
    const encodedData = this.generateMultiCallData(
      contract,
      functionName,
      callData
    );
    const tx = await contract.multicall(encodedData);
    const result = await tx.wait();
    return result;
  }

  private generateMultiCallData(
    contract: ethers.Contract,
    functionName: string,
    callData: string[] | string[][]
  ) {
    const encodedData = [];
    for (const call of callData) {
      const encoded = contract.interface.encodeFunctionData(functionName, [
        ...call,
      ]);
      encodedData.push(encoded);
    }
    return encodedData;
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

    if (contractName === 'AAPROJECT') {
      contractAddress = contract.AAPROJECT.ADDRESS;
      contractABI = this.convertABI(contract.AAPROJECT.ABI);
    } else if (contractName === 'RAHATTOKEN') {
      contractAddress = contract.RAHATTOKEN.ADDRESS;
      contractABI = this.convertABI(contract.RAHATTOKEN.ABI);
      console.log('RAHATTOKEN address:', contractAddress);
      console.log('RAHATTOKEN ABI length:', contractABI?.length);
    } else if (contractName === 'INKIND') {
      contractAddress = contract.INKIND.ADDRESS;
      contractABI = this.convertABI(contract.INKIND.ABI);
      console.log('INKIND address:', contractAddress);
      console.log('INKIND ABI length:', contractABI?.length);
    } else if (contractName === 'INKINDTOKEN') {
      contractAddress = contract.INKINDTOKEN.ADDRESS;
      contractABI = this.convertABI(contract.INKINDTOKEN.ABI);
      console.log('INKINDTOKEN address:', contractAddress);
      console.log('INKINDTOKEN ABI length:', contractABI?.length);
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
      throw new RpcException(`Invalid ABI format: ${error.message}`);
    }
  }

  private lowerCaseObjectKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.lowerCaseObjectKeys(item));
    }
    if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj).reduce((acc, key) => {
        acc[key.toLowerCase()] = this.lowerCaseObjectKeys(obj[key]);
        return acc;
      }, {} as any);
    }
    return obj;
  }

  private async getDisbursableGroupsUuids() {
    const benGroups = await this.prismaService.beneficiaryGroupTokens.findMany({
      where: {
        AND: [
          { numberOfTokens: { gt: 0 } },
          { isDisbursed: false },
          { payout: { is: null } },
        ],
      },
      select: { uuid: true, groupId: true },
    });
    return benGroups.map((group) => group.groupId);
  }

  async getBeneficiaryTokenBalance(groupUuids: string[]) {
    if (!groupUuids.length) return [];

    const [groups, tokens] = await Promise.all([
      this.fetchGroupedBeneficiaries(groupUuids),
      this.fetchGroupTokenAmounts(groupUuids),
    ]);

    this.logger.log(`Found ${groups.length} groups`);
    this.logger.log(`Found ${tokens.length} tokens`);

    return this.computeBeneficiaryTokenDistribution(groups, tokens);
  }

  private async fetchGroupedBeneficiaries(groupUuids: string[]) {
    const response = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.beneficiary.list_group_by_project' },
        { data: groupUuids.map((uuid) => ({ uuid })) }
      )
    );

    return response.data ?? [];
  }

  private async fetchGroupTokenAmounts(groupUuids: string[]) {
    return this.prismaService.beneficiaryGroupTokens.findMany({
      where: { groupId: { in: groupUuids } },
      select: { numberOfTokens: true, groupId: true },
    });
  }

  private computeBeneficiaryTokenDistribution(
    groups: any[],
    tokens: { numberOfTokens: number; groupId: string }[]
  ) {
    const csvData: Record<
      string,
      { phone: string; amount: string; id: string; walletAddress: string }
    > = {};

    this.logger.log(`Computing beneficiary token distribution`);
    groups.forEach((group) => {
      const groupToken = tokens.find((t) => t.groupId === group.uuid);
      const totalTokens = groupToken?.numberOfTokens ?? 0;

      const uniqueBeneficiaries = new Map<
        string,
        typeof group.groupedBeneficiaries[0]
      >();
      group.groupedBeneficiaries.forEach((item) => {
        const beneficiaryId = item.Beneficiary.uuid;
        if (!uniqueBeneficiaries.has(beneficiaryId)) {
          uniqueBeneficiaries.set(beneficiaryId, item);
        }
      });

      const totalBeneficiaries = uniqueBeneficiaries.size;
      if (totalBeneficiaries === 0) {
        this.logger.warn(`Group ${group.uuid} has no unique beneficiaries`);
        return;
      }

      const tokenPerBeneficiary = totalTokens / totalBeneficiaries;

      uniqueBeneficiaries.forEach(({ Beneficiary }) => {
        const phone = Beneficiary.pii.phone;
        const walletAddress = Beneficiary.walletAddress;
        const amount = tokenPerBeneficiary;

        if (csvData[phone]) {
          csvData[phone].amount = (
            parseFloat(csvData[phone].amount) + amount
          ).toString();
        } else {
          csvData[phone] = {
            phone,
            walletAddress,
            amount: amount.toString(),
            id: Beneficiary.uuid,
          };
        }
      });
    });

    return Object.values(csvData);
  }
}

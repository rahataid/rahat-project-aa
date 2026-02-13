// apps/aa/src/processors/evm.processor.ts
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import { Job, Queue } from 'bull';
import { ethers } from 'ethers';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { BQUEUE, CORE_MODULE, EVENTS, JOBS } from '../constants';
import { AddTriggerDto } from '../stellar/dto/trigger.dto';
import { lastValueFrom } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { lowerCaseObjectKeys } from '../utils/utility';

// Contract ABIs (you'll need to generate these from your Solidity contracts)
// Contract ABIs - importing as require to avoid JSON module resolution issues
const AAProjectABI = require('../contracts/abis/AAProject.json');
const TriggerManagerABI = require('../contracts/abis/TriggerManager.json');

interface EVMTransactionResult {
  txHash: string;
  blockNumber?: number;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  gasUsed?: bigint;
  contractAddress?: string;
}

interface EVMDisbursementJob {
  dName: string;
  groups: string;
}

interface EVMTriggerJob {
  triggers: AddTriggerDto[];
}

interface EVMStatusUpdateJob {
  txHash: string;
  groupUuid: string;
  beneficiaries: string[];
  amounts: string[];
  identifier: string;
  batchNumber: number;
  totalBatches: number;
}

@Processor(BQUEUE.EVM)
@Injectable()
export class EVMProcessor {
  private readonly logger = new Logger(EVMProcessor.name);
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private isInitialized = false;

  constructor(
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly beneficiaryService: BeneficiaryService,
    private readonly settingService: SettingsService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(BQUEUE.EVM) private readonly evmQueue: Queue,
    private readonly prismaService: PrismaService
  ) {
    this.initializeProvider();
  }

  private async initializeProvider() {
    try {
      const chainConfig = await this.getFromSettings('CHAIN_SETTINGS');
      const deployerPrivateKey = await this.getFromSettings(
        'DEPLOYER_PRIVATE_KEY'
      );

      this.provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
      this.signer = new ethers.Wallet(deployerPrivateKey, this.provider);

      // Test the connection
      await this.provider.getBlockNumber();
      this.isInitialized = true;

      this.logger.log('EVM Provider initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize EVM providerss:', error);
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

  @Process({ name: JOBS.EVM.ASSIGN_TOKENS, concurrency: 1 })
  async assignTokens(job: Job<EVMDisbursementJob>) {
    const { groups } = job.data;
    const BATCH_SIZE = 10;

    try {
      this.logger.log('Processing EVM assign tokens...', EVMProcessor.name);
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
      const formatedAbi = lowerCaseObjectKeys(contract.RAHATTOKEN.ABI);

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

      // Process beneficiaries in batches of 10
      const transactionHashes: string[] = [];
      const totalBeneficiaries = multicallTxnPayload.length;
      const numberOfBatches = Math.ceil(totalBeneficiaries / BATCH_SIZE);

      this.logger.log(
        `Processing ${totalBeneficiaries} beneficiaries in ${numberOfBatches} batches of ${BATCH_SIZE}`,
        EVMProcessor.name
      );

      for (let i = 0; i < numberOfBatches; i++) {
        const startIndex = i * BATCH_SIZE;
        const endIndex = Math.min(startIndex + BATCH_SIZE, totalBeneficiaries);
        const batchPayload = multicallTxnPayload.slice(startIndex, endIndex);

        this.logger.log(
          `Processing batch ${i + 1}/${numberOfBatches} with ${
            batchPayload.length
          } beneficiaries`,
          EVMProcessor.name
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
            EVMProcessor.name
          );

          // Add a small delay between batches to avoid overwhelming the network
          if (i < numberOfBatches - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
          }
        } catch (batchError) {
          this.logger.error(
            `Error in batch ${i + 1}: ${batchError.message}`,
            batchError.stack,
            EVMProcessor.name
          );

          // Update group status to failed for this batch
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

      // Update group status to started with all transaction hashes
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

      // Add status update jobs for each transaction
      for (let i = 0; i < transactionHashes.length; i++) {
        const txHash = transactionHashes[i];
        const startIndex = i * BATCH_SIZE;
        const endIndex = Math.min(startIndex + BATCH_SIZE, totalBeneficiaries);
        const batchBeneficiaries = bens.slice(startIndex, endIndex);

        this.evmQueue.add(
          JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE,
          {
            txHash,
            groupUuid: Array.isArray(groups) ? groups[0] : groups,
            beneficiaries: batchBeneficiaries.map((ben) => ben.walletAddress),
            amounts: batchBeneficiaries.map((ben) => ben.amount),
            identifier: `disbursement_batch_${i + 1}_${Date.now()}`,
            batchNumber: i + 1,
            totalBatches: numberOfBatches,
          },
          {
            delay: 0.2 * 60 * 1000, // 0.2 minutes
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
        EVMProcessor.name
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
        EVMProcessor.name
      );
      throw error;
    }
  }

  @Process({ name: JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE, concurrency: 1 })
  async disbursementStatusUpdate(job: Job<EVMStatusUpdateJob>) {
    try {
      this.logger.log(
        'Processing EVM disbursement status update...',
        EVMProcessor.name
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
        this.logger.error(`Group ${groupUuid} not found`, EVMProcessor.name);
        return;
      }

      // Check if the group was updated more than 60 minutes ago (assume failed)
      if (
        new Date(group.updatedAt).getTime() <
        new Date().getTime() - 60 * 60 * 1000
      ) {
        this.logger.log(
          `Group ${groupUuid} updated more than 60 minutes ago, assuming disbursement failed`,
          EVMProcessor.name
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

      // Check transaction status on blockchain
      try {
        const txReceipt = await this.provider.getTransactionReceipt(txHash);

        if (!txReceipt) {
          this.logger.log(
            `Transaction ${txHash} not yet confirmed, adding another status update job`,
            EVMProcessor.name
          );

          // Add another status update job to check again in 0.2 minutes
          this.evmQueue.add(
            JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE,
            job.data,
            {
              delay: 0.2 * 60 * 1000, // 0.2 minutes
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
            }
          );
          return;
        }

        // Transaction confirmed, check if it was successful
        if (txReceipt.status === 1) {
          this.logger.log(
            `Transaction ${txHash} confirmed successfully`,
            EVMProcessor.name
          );

          // Create DisbursementLogs records for each beneficiary in this batch
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
          // emitting new event
          this.eventEmitter.emit(EVENTS.TOKEN_DISBURSED, {
            groupUuid,
          });
        } else {
          this.logger.log(
            `Transaction ${txHash} failed on blockchain`,
            EVMProcessor.name
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
          EVMProcessor.name
        );

        // If we can't check the transaction, assume it failed
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
        EVMProcessor.name
      );
      throw error;
    }
  }

  /**
   * Creates DisbursementLogs records for each beneficiary in a successful batch
   * @param groupUuid - The UUID of the beneficiary group
   * @param txHash - The transaction hash of the successful batch
   * @param beneficiaries - Array of beneficiary wallet addresses
   * @param amounts - Array of token amounts for each beneficiary
   * @param batchNumber - The current batch number
   * @param totalBatches - Total number of batches for this disbursement
   */
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
        EVMProcessor.name
      );

      // Get the beneficiary group token record
      const groupToken =
        await this.beneficiaryService.getOneTokenReservationByGroupId(
          groupUuid
        );

      if (!groupToken) {
        this.logger.error(
          `Group token not found for group ${groupUuid}`,
          EVMProcessor.name
        );
        return;
      }

      // Create DisbursementLogs records for each beneficiary
      const disbursementLogs = [];

      for (let i = 0; i < beneficiaries.length; i++) {
        const beneficiaryWalletAddress = beneficiaries[i];
        const amount = amounts[i];

        // Create individual disbursement log record
        // const disbursementLog =
        //   await this.prismaService.disbursementLogs.create({
        //     data: {
        //       txnHash: txHash,
        //       beneficiaryGroupTokenId: groupToken.uuid,
        //       beneficiaryWalletAddress: beneficiaryWalletAddress,
        //       // Additional metadata can be stored in a separate field if needed
        //     },
        //   });

        // disbursementLogs.push(disbursementLog);

        this.logger.log(
          `Created DisbursementLog for beneficiary ${beneficiaryWalletAddress} with amount ${amount}`,
          EVMProcessor.name
        );
      }

      this.logger.log(
        `Successfully created ${disbursementLogs.length} DisbursementLogs records for batch ${batchNumber}`,
        EVMProcessor.name
      );

      return disbursementLogs;
    } catch (error) {
      this.logger.error(
        `Error creating DisbursementLogs for batch ${batchNumber}: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw error;
    }
  }

  @Process({ name: JOBS.CONTRACT.CHECK_BALANCE, concurrency: 1 })
  async checkBalance(
    job: Job<{ address: string; tokenAddress: string; projectContract: string }>
  ) {
    try {
      this.logger.log('Processing EVM balance check...', EVMProcessor.name);
      await this.ensureInitialized();

      const { address, tokenAddress, projectContract } = job.data;

      // Get ETH balance
      const ethBalance = await this.provider.getBalance(address);

      // Get token balance
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        this.provider
      );

      const tokenBalance = await tokenContract.balanceOf(address);

      // Get project contract balance for this beneficiary
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
        transactions: [], // TODO: Implement transaction history
      };
    } catch (error) {
      this.logger.error(
        `Error in EVM balance check: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw error;
    }
  }

  @Process({ name: JOBS.CONTRACT.FUND_ACCOUNT, concurrency: 1 })
  async fundAccount(job: Job<{ walletAddress: string; amount: string }>) {
    try {
      this.logger.log('Processing EVM fund account...', EVMProcessor.name);
      await this.ensureInitialized();

      const { walletAddress, amount } = job.data;

      // Send ETH to the wallet address
      const tx = await this.signer.sendTransaction({
        to: walletAddress,
        value: ethers.parseEther(amount),
      });

      const receipt = await tx.wait();

      this.logger.log(
        `Successfully funded account ${walletAddress} with ${amount} ETH. Transaction: ${receipt.hash}`,
        EVMProcessor.name
      );

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        walletAddress,
        amount,
      };
    } catch (error) {
      this.logger.error(
        `Error in EVM fund account: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw error;
    }
  }

  @Process({ name: JOBS.CONTRACT.TRANSFER_TOKENS, concurrency: 1 })
  async transferTokens(job: Job<{ from: string; to: string; amount: string }>) {
    try {
      this.logger.log('Processing EVM transfer tokens...', EVMProcessor.name);
      await this.ensureInitialized();

      const { from, to, amount } = job.data;

      // Get the token contract
      const chainConfig = await this.getFromSettings('CHAIN_SETTINGS');
      const tokenContract = new ethers.Contract(
        chainConfig.tokenContractAddress,
        [
          'function transfer(address to, uint256 amount) returns (bool)',
          'function balanceOf(address account) view returns (uint256)',
        ],
        this.signer
      );

      // Check balance before transfer
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

      // Transfer tokens
      const tx = await tokenContract.transfer(to, transferAmount);
      const receipt = await tx.wait();

      this.logger.log(
        `Successfully transferred ${amount} tokens from ${from} to ${to}. Transaction: ${receipt.hash}`,
        EVMProcessor.name
      );

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        from,
        to,
        amount,
      };
    } catch (error) {
      this.logger.error(
        `Error in EVM transfer tokens: ${error.message}`,
        error.stack,
        EVMProcessor.name
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

      console.log('settings', settings);

      if (!settings?.value) {
        throw new Error('CHAIN_SETTINGS not found');
      }

      const chainConfig = settings.value;

      return chainConfig;
    } catch (error) {
      this.logger.error(`Error getting setting `);
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
    } else {
      throw new Error(`Unsupported contract name: ${contractName}`);
    }

    return new ethers.Contract(contractAddress, contractABI, contractSigner);
  }

  private async createContractInstance(contractName: any, abi: any) {
    const contract = await this.getFromSettings('CONTRACT');

    const formatedAbi = this.convertABI(contract.AAPROJECT.ABI);

    return new ethers.Contract(
      contract.AAPROJECT.ADDRESS,
      formatedAbi,
      this.provider
    );
  }

  /**
   * Check if a beneficiary wallet has tokens in the benTokens mapping
   * @param beneficiaryAddress - The wallet address to check
   * @returns Promise<boolean> - True if beneficiary has tokens, false otherwise
   */
  async checkBeneficiaryHasTokens(
    beneficiaryAddress: string
  ): Promise<boolean> {
    try {
      await this.ensureInitialized();

      const aaContract = await this.createContractInstance(
        'AAPROJECT',
        AAProjectABI
      );

      // Call the benTokens mapping to get the token balance
      const tokenBalance = await aaContract.benTokens.staticCall(
        beneficiaryAddress
      );

      console.log('tokenBalance', tokenBalance);

      this.logger.log(
        `Beneficiary ${beneficiaryAddress} has ${tokenBalance.toString()} tokens`,
        EVMProcessor.name
      );

      // Return true if the beneficiary has more than 0 tokens
      return tokenBalance > 0n;
    } catch (error) {
      this.logger.error(
        `Error checking beneficiary tokens for ${beneficiaryAddress}: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw new RpcException(
        `Failed to check beneficiary tokens: ${error.message}`
      );
    }
  }

  /**
   * Get the token balance for a beneficiary wallet from the benTokens mapping
   * @param beneficiaryAddress - The wallet address to check
   * @returns Promise<string> - The token balance as a string
   */
  async getBeneficiaryTokenBalanceFromContract(
    beneficiaryAddress: string
  ): Promise<string> {
    try {
      await this.ensureInitialized();

      const aaContract = await this.createContractInstance(
        'AAPROJECT',
        AAProjectABI
      );

      // Call the benTokens mapping to get the token balance
      const tokenBalance = await aaContract.benTokens(beneficiaryAddress);

      this.logger.log(
        `Beneficiary ${beneficiaryAddress} token balance: ${tokenBalance.toString()}`,
        EVMProcessor.name
      );

      return tokenBalance.toString();
    } catch (error) {
      this.logger.error(
        `Error getting beneficiary token balance for ${beneficiaryAddress}: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw new RpcException(
        `Failed to get beneficiary token balance: ${error.message}`
      );
    }
  }

  /**
   * Get the project contract balance from RahatToken contract
   * @param projectAddress - The project contract address to check
   * @returns Promise<string> - The project token balance as a string
   */
  async getProjectTokenBalance(projectAddress: string): Promise<string> {
    try {
      await this.ensureInitialized();

      // Get contract settings to find RahatToken address and ABI
      const contract = await this.getFromSettings('CONTRACT');
      const rahatTokenAddress = contract.RAHATTOKEN.ADDRESS;
      const rahatTokenABI = this.convertABI(contract.RAHATTOKEN.ABI);

      console.log('rahatTokenAddress', rahatTokenAddress);
      console.log('rahatTokenABI', rahatTokenABI);

      // Create RahatToken contract instance using the token address and ABI from settings
      const rahatTokenContract = new ethers.Contract(
        rahatTokenAddress,
        rahatTokenABI,
        this.provider
      );

      // Call the balanceOf function to get the project's token balance
      const tokenBalance = await rahatTokenContract.balanceOf(projectAddress);

      this.logger.log(
        `Project ${projectAddress} token balance: ${tokenBalance.toString()}`,
        EVMProcessor.name
      );

      return tokenBalance.toString();
    } catch (error) {
      this.logger.error(
        `Error getting project token balance for ${projectAddress}: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw new RpcException(
        `Failed to get project token balance: ${error.message}`
      );
    }
  }

  /**
   * Check if project has sufficient tokens for disbursement
   * @param projectAddress - The project contract address to check
   * @param requiredAmount - The amount of tokens required
   * @returns Promise<boolean> - True if project has sufficient tokens, false otherwise
   */
  async checkProjectHasSufficientTokens(
    projectAddress: string,
    requiredAmount: string
  ): Promise<boolean> {
    try {
      const currentBalance = await this.getProjectTokenBalance(projectAddress);
      const hasSufficient = BigInt(currentBalance) >= BigInt(requiredAmount);

      this.logger.log(
        `Project ${projectAddress} has ${currentBalance} tokens, required: ${requiredAmount}, sufficient: ${hasSufficient}`,
        EVMProcessor.name
      );

      return hasSufficient;
    } catch (error) {
      this.logger.error(
        `Error checking project sufficient tokens for ${projectAddress}: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw new RpcException(
        `Failed to check project sufficient tokens: ${error.message}`
      );
    }
  }

  /**
   * Transfer beneficiary tokens to vendor using AAProject contract
   * @param beneficiaryAddress - The beneficiary wallet address
   * @param vendorAddress - The vendor wallet address
   * @param amount - The amount of tokens to transfer
   * @returns Promise<any> - Transaction result with hash and status
   */
  async transferBeneficiaryTokenToVendor(
    beneficiaryAddress: string,
    vendorAddress: string,
    amount: string
  ): Promise<any> {
    try {
      await this.ensureInitialized();

      // Create contract instance with signer for transactions
      const aaContract = await this.createContractInstance(
        'AAPROJECT',
        AAProjectABI
      );

      // Check beneficiary token balance first
      const beneficiaryBalance = await aaContract.benTokens.staticCall(
        beneficiaryAddress
      );
      const transferAmount = amount;

      const aaContractSigner = await this.createContractInstanceSign(
        'AAPROJECT',
        AAProjectABI,
        this.signer
      );

      const tx = await aaContractSigner.transferTokenToVendor(
        beneficiaryAddress,
        vendorAddress,
        transferAmount
      );
      const receipt = await tx.wait();

      this.logger.log(
        `Successfully transferred ${amount} tokens from beneficiary ${beneficiaryAddress} to vendor ${vendorAddress} using AAProject contract. Transaction: ${receipt.hash}`,
        EVMProcessor.name
      );

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        from: beneficiaryAddress,
        to: vendorAddress,
        amount,
        method: 'transferTokenToVendor',
      };
    } catch (error) {
      this.logger.error(
        `Error transferring beneficiary tokens to vendor for ${beneficiaryAddress}: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw new RpcException(
        `Failed to transfer beneficiary tokens to vendor: ${error.message}`
      );
    }
  }

  /**
   * Get wallet balance for a given address using the AA contract
   * @param walletAddress - The wallet address to check balance for
   * @returns The token balance for the given address
   */
  async getWalletBalance(
    walletAddress: string
  ): Promise<{ balance: string; address: string }> {
    try {
      this.logger.log(
        `Getting wallet balance for address: ${walletAddress}`,
        EVMProcessor.name
      );
      await this.ensureInitialized();

      const rahatTokenContract = await this.createContractInstanceSign(
        'RAHATTOKEN'
      );
      const aaContract = await this.createContractInstance(
        'AAPROJECT',
        AAProjectABI
      );
      console.log('decimals', rahatTokenContract.decimals);

      const decimals = await rahatTokenContract.decimals.staticCall();

      // Get token balance using benTokens.staticCall
      const tokenBalance = await aaContract.benTokens.staticCall(walletAddress);

      this.logger.log(
        `Token balance for ${walletAddress}: ${tokenBalance.toString()}`,
        EVMProcessor.name
      );

      return {
        balance: ethers.formatUnits(tokenBalance, decimals),
        address: walletAddress,
      };
    } catch (error) {
      this.logger.error(
        `Error getting wallet balance for ${walletAddress}: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw new RpcException(`Failed to get wallet balance: ${error.message}`);
    }
  }

  /**
   * Get RahatToken ERC20 balance for a given wallet address
   * @param walletAddress - The wallet address to check RahatToken balance for
   * @returns Promise<{ balance: string; address: string }> - The RahatToken balance and address
   */
  async getRahatTokenBalance(
    walletAddress: string
  ): Promise<{ balance: string; address: string }> {
    try {
      this.logger.log(
        `Getting RahatToken balance for address: ${walletAddress}`,
        EVMProcessor.name
      );
      await this.ensureInitialized();

      // Debug: Check contract settings structure
      const contract = await this.getFromSettings('CONTRACT');
      console.log(
        'Contract settings structure:',
        JSON.stringify(contract, null, 2)
      );

      // Create RahatToken contract instance using the existing method
      const rahatTokenContract = await this.createContractInstanceSign(
        'RAHATTOKEN'
      );

      // Call the balanceOf function to get the wallet's RahatToken balance
      const tokenBalance = await rahatTokenContract.balanceOf.staticCall(
        walletAddress
      );

      console.log('tokenBalance', tokenBalance);

      this.logger.log(
        `RahatToken balance for ${walletAddress}: ${tokenBalance.toString()}`,
        EVMProcessor.name
      );

      return {
        balance: tokenBalance.toString(),
        address: walletAddress,
      };
    } catch (error) {
      this.logger.error(
        `Error getting RahatToken balance for ${walletAddress}: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw new RpcException(
        `Failed to get RahatToken balance: ${error.message}`
      );
    }
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

  private async getDisbursableGroupsUuids() {
    const benGroups = await this.prismaService.beneficiaryGroupTokens.findMany({
      where: {
        AND: [
          {
            numberOfTokens: {
              gt: 0,
            },
          },
          { isDisbursed: false },
          {
            payout: {
              is: null,
            },
          },
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

      // Deduplicate beneficiaries within this group by beneficiary UUID
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

      // Distribute tokens only to unique beneficiaries
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

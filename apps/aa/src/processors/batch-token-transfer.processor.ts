import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger, Injectable, Inject } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { BQUEUE, CORE_MODULE, JOBS } from '../constants';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import { ethers } from 'ethers';
import {
  BatchTransferDto,
  BatchTransferResult,
  ManualPayoutBatchTransferDto,
  SingleTransfer,
} from './types';
import { lowerCaseObjectKeys } from '../utils/utility';

const BATCH_SIZE = 10;

@Processor(BQUEUE.BATCH_TRANSFER)
@Injectable()
export class BatchTokenTransferProcessor {
  private readonly logger = new Logger(BatchTokenTransferProcessor.name);

  constructor(
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly prismaService: PrismaService,
    private readonly settingsService: SettingsService,
    @InjectQueue(BQUEUE.BATCH_TRANSFER)
    private readonly batchTransferQueue: Queue
  ) {}
  @Process({ name: JOBS.BATCH_TRANSFER.PROCESS_BATCH, concurrency: 1 })
  async processBatchTransfer(
    job: Job<BatchTransferDto>
  ): Promise<BatchTransferResult> {
    const { transfers, batchId } = job.data;

    this.logger.log(
      `Processing batch transfer with ${
        transfers.length
      } transfers. Batch ID: ${batchId || 'N/A'}`,
      BatchTokenTransferProcessor.name
    );

    try {
      // Process transfers in batches of 10
      const batches = this.createBatches(transfers, BATCH_SIZE);
      const results = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        this.logger.log(
          `Processing batch ${i + 1}/${batches.length} with ${
            batch.length
          } transfers`,
          BatchTokenTransferProcessor.name
        );

        try {
          const batchResult = await this.processBatch(batch, i + 1);
          results.push(batchResult);
        } catch (error) {
          this.logger.error(
            `Failed to process batch ${i + 1}: ${error.message}`,
            error.stack,
            BatchTokenTransferProcessor.name
          );

          // Continue with next batch even if one fails
          results.push({
            batchNumber: i + 1,
            success: false,
            error: error.message,
            transfers: batch.length,
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const totalTransfers = transfers.length;

      this.logger.log(
        `Batch transfer completed. ${successCount}/${batches.length} batches successful, ${totalTransfers} total transfers`,
        BatchTokenTransferProcessor.name
      );

      return {
        success: true,
        batchId,
        totalBatches: batches.length,
        successfulBatches: successCount,
        totalTransfers,
        results,
      };
    } catch (error) {
      this.logger.error(
        `Failed to process batch transfer: ${error.message}`,
        error.stack,
        BatchTokenTransferProcessor.name
      );
      throw new RpcException(`Batch transfer failed: ${error.message}`);
    }
  }

  @Process({
    name: JOBS.BATCH_TRANSFER.PROCESS_MANUAL_PAYOUT_BATCH,
    concurrency: 1,
  })
  async processManualPayoutBatchTransfer(
    job: Job<ManualPayoutBatchTransferDto>
  ): Promise<BatchTransferResult> {
    const { transfers, batchId } = job.data;

    this.logger.log(
      `Processing batch transfer with ${
        transfers.length
      } transfers. Batch ID: ${batchId || 'N/A'}`,
      BatchTokenTransferProcessor.name
    );

    try {
      // Process transfers in batches of 10
      const batches = this.createBatches(transfers, BATCH_SIZE);
      const results = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        this.logger.log(
          `Processing batch ${i + 1}/${batches.length} with ${
            batch.length
          } transfers`,
          BatchTokenTransferProcessor.name
        );

        try {
          const batchResult = await this.processManualPayoutBatch(batch, i + 1);
          results.push(batchResult);
        } catch (error) {
          this.logger.error(
            `Failed to process batch ${i + 1}: ${error.message}`,
            error.stack,
            BatchTokenTransferProcessor.name
          );

          // Continue with next batch even if one fails
          results.push({
            batchNumber: i + 1,
            success: false,
            error: error.message,
            transfers: batch.length,
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const totalTransfers = transfers.length;

      this.logger.log(
        `Batch transfer completed. ${successCount}/${batches.length} batches successful, ${totalTransfers} total transfers`,
        BatchTokenTransferProcessor.name
      );

      return {
        success: true,
        batchId,
        totalBatches: batches.length,
        successfulBatches: successCount,
        totalTransfers,
        results,
      };
    } catch (error) {
      this.logger.error(
        `Failed to process batch transfer: ${error.message}`,
        error.stack,
        BatchTokenTransferProcessor.name
      );
      throw new RpcException(`Batch transfer failed: ${error.message}`);
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async processManualPayoutBatch(
    transfers: SingleTransfer[],
    batchNumber: number
  ) {
    try {
      const CASH_TOKEN_ADDRESS = await this.getFromSettings(
        'CASH_TOKEN_CONTRACT'
      );

      const { contract: aaContract } = await this.createContractInstanceSign(
        'AAPROJECT'
      );
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

      const multicallTxnPayload: any[][] = [];

      //TODO: Check for the cash token approval from vendor(WARD Smart account) to AA contract
      //TODO: test this code

      //  const hasApproval = await this.checkCashTokenApproval(
      //     transfers[0].vendorWalletAddress,// assuming all transfers in batch are from same vendor
      //     aaContract.target.toString(),
      //     transfers.reduce((sum, t) => sum + BigInt(t.amount), BigInt(0)).toString()
      //   );
      //   if (!hasApproval) {
      //     this.logger.error(
      //       `Vendor ${transfers[0].vendorWalletAddress} has not approved enough cash tokens to AA contract ${aaContract.target.toString()}, skipping transfer`,
      //       BatchTokenTransferProcessor.name
      //     );
      //     throw new RpcException('Vendor has not approved enough cash tokens to AA contract');
      //   }

      for (const transfer of transfers) {
        const hasTokens = await this.checkBeneficiaryHasTokens(
          transfer.beneficiaryWalletAddress
        );

        if (!hasTokens) {
          this.logger.warn(
            `Beneficiary ${transfer.beneficiaryWalletAddress} has no tokens, skipping transfer`,
            BatchTokenTransferProcessor.name
          );
          continue;
        }
        const formattedAmountBn = ethers.parseUnits(
          transfer.amount.toString(),
          decimal
        );
        console.log('transfer amount ', transfer.amount);
        console.log('decimal ', decimal, formattedAmountBn);

        multicallTxnPayload.push([
          transfer.beneficiaryWalletAddress,
          transfer.vendorWalletAddress,
          CASH_TOKEN_ADDRESS,
          formattedAmountBn,
        ]);
      }

      if (multicallTxnPayload.length === 0) {
        this.logger.warn(
          `No valid transfers in batch ${batchNumber}`,
          BatchTokenTransferProcessor.name
        );
        return {
          batchNumber,
          success: true,
          message: 'No valid transfers in batch',
          transfers: transfers.length,
          processedTransfers: 0,
        };
      }

      // Execute multicall
      const txn = await this.multiSend(
        aaContract,
        'transferTokenToVendorForCashToken',
        multicallTxnPayload
      );

      this.logger.log(
        `Batch ${batchNumber} executed successfully. Transaction hash: ${txn.hash}`,
        BatchTokenTransferProcessor.name
      );

      await this.updateBeneficiaryFieldOfficerRedeemRecords(
        transfers,
        txn.hash
      );

      return {
        batchNumber,
        success: true,
        transactionHash: txn.hash,
        blockNumber: txn.blockNumber,
        transfers: transfers.length,
        processedTransfers: multicallTxnPayload.length,
      };
    } catch (error) {
      this.logger.error(
        `Error processing batch ${batchNumber}: ${error.message}`,
        error.stack,
        BatchTokenTransferProcessor.name
      );
      throw error;
    }
  }

  private async processBatch(transfers: SingleTransfer[], batchNumber: number) {
    try {
      // Create contract instance
      const { contract: aaContract } = await this.createContractInstanceSign(
        'AAPROJECT'
      );
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

      // Prepare multicall data
      const multicallTxnPayload: any[][] = [];

      for (const transfer of transfers) {
        // Validate vendor exists
        const vendor = await this.prismaService.vendor.findFirst({
          where: { walletAddress: transfer.vendorWalletAddress },
        });

        if (!vendor) {
          this.logger.warn(
            `Vendor not found for wallet address: ${transfer.vendorWalletAddress}`,
            BatchTokenTransferProcessor.name
          );
          continue;
        }

        // Check if beneficiary has tokens
        // const hasTokens = await this.checkBeneficiaryHasTokens(
        //   transfer.beneficiaryWalletAddress
        // );

        // if (!hasTokens) {
        //   this.logger.warn(
        //     `Beneficiary ${transfer.beneficiaryWalletAddress} has no tokens, skipping transfer`,
        //     BatchTokenTransferProcessor.name
        //   );
        //   continue;
        // }

        // Add to multicall payload
        multicallTxnPayload.push([
          transfer.beneficiaryWalletAddress,
          transfer.vendorWalletAddress,
          ethers.formatUnits(transfer.amount, decimal),
        ]);
      }

      if (multicallTxnPayload.length === 0) {
        this.logger.warn(
          `No valid transfers in batch ${batchNumber}`,
          BatchTokenTransferProcessor.name
        );
        return {
          batchNumber,
          success: true,
          message: 'No valid transfers in batch',
          transfers: transfers.length,
          processedTransfers: 0,
        };
      }

      // Execute multicall
      const txn = await this.multiSend(
        aaContract,
        'transferTokenToVendor',
        multicallTxnPayload
      );

      this.logger.log(
        `Batch ${batchNumber} executed successfully. Transaction hash: ${txn.hash}`,
        BatchTokenTransferProcessor.name
      );

      // Update beneficiary redeem records
      await this.updateBeneficiaryVendorRedeemRecords(transfers, txn.hash);

      return {
        batchNumber,
        success: true,
        transactionHash: txn.hash,
        blockNumber: txn.blockNumber,
        transfers: transfers.length,
        processedTransfers: multicallTxnPayload.length,
      };
    } catch (error) {
      this.logger.error(
        `Error processing batch ${batchNumber}: ${error.message}`,
        error.stack,
        BatchTokenTransferProcessor.name
      );
      throw error;
    }
  }

  private async checkBeneficiaryHasTokens(
    beneficiaryAddress: string
  ): Promise<boolean> {
    try {
      const { contract: aaContract } = await this.createContractInstanceSign(
        'AAPROJECT'
      );
      const balance = await aaContract.benTokens.staticCall(beneficiaryAddress);
      return balance > 0;
    } catch (error) {
      this.logger.error(
        `Error checking beneficiary tokens for ${beneficiaryAddress}: ${error.message}`,
        BatchTokenTransferProcessor.name
      );
      return false;
    }
  }

  private async checkCashTokenApproval(
    owner: string,
    spender: string,
    amount: string
  ): Promise<boolean> {
    try {
      this.logger.log(
        `Checking cash token approval for ${owner} to ${spender} for amount ${amount}`
      );
      const CASH_TOKEN_ADDRESS = await this.getFromSettings(
        'CASH_TOKEN_CONTRACT'
      );
      const cashTokenContract = new ethers.Contract(
        CASH_TOKEN_ADDRESS,
        [
          // Minimal ERC20 ABI for allowance
          'function allowance(address owner, address spender) view returns (uint256)',
        ],
        new ethers.JsonRpcProvider(
          (await this.getFromSettings('CHAIN_SETTINGS')).rpcUrl
        )
      );

      const allowance = await cashTokenContract.allowance.staticCall(
        owner,
        spender
      );

      return BigInt(allowance) >= BigInt(amount);
    } catch (error) {
      this.logger.error(
        `Error checking cash token approval for ${owner}: ${error.message}`,
        BatchTokenTransferProcessor.name
      );
      return false;
    }
  }

  private async updateBeneficiaryFieldOfficerRedeemRecords(
    transfers: SingleTransfer[],
    txHash: string
  ) {
    this.logger.log(
      `Creating manual bank transfer logs for benfs: ${transfers.map(
        (t) => t.beneficiaryWalletAddress
      )}`
    );
    for (const transfer of transfers) {
      const existingRedeem =
        await this.prismaService.beneficiaryRedeem.findFirst({
          where: {
            beneficiaryWalletAddress: transfer.beneficiaryWalletAddress,
            status: 'FIAT_TRANSACTION_INITIATED',
            isCompleted: false,
            txHash: null,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

      try {
        // Find existing redeem record
        if (existingRedeem) {
          // Update existing record
          await this.prismaService.beneficiaryRedeem.update({
            where: {
              uuid: existingRedeem.uuid,
            },
            data: {
              txHash,
              isCompleted: true,
              status: 'FIAT_TRANSACTION_COMPLETED',
              amount: parseInt(transfer.amount),
              info: {
                ...(typeof existingRedeem.info === 'object' &&
                existingRedeem.info !== null
                  ? existingRedeem.info
                  : {}),
                offrampWalletAddress: transfer.vendorWalletAddress,
                date: transfer.date,
                approvalDate: transfer.approvalDate,
                message:
                  'Fiat transfer to field officer completed successfully',
                transactionHash: txHash,
                mode: 'MANUAL_BANK_TRANSFER',
              },
            },
          });
        } else {
          // Create new record
          await this.prismaService.beneficiaryRedeem.create({
            data: {
              beneficiaryWalletAddress: transfer.beneficiaryWalletAddress,
              amount: parseInt(transfer.amount),
              transactionType: 'FIAT_TRANSFER',
              status: 'FIAT_TRANSACTION_COMPLETED',
              isCompleted: true,
              txHash,
              info: {
                offrampWalletAddress: transfer.vendorWalletAddress,
                date: transfer.date,
                approvalDate: transfer.approvalDate,
                message:
                  'Fiat transfer to field officer completed successfully',
                transactionHash: txHash,
                mode: 'MANUAL_BANK_TRANSFER',
              },
            },
          });
        }
      } catch (error) {
        this.logger.error(
          BatchTokenTransferProcessor.name,
          `Failed to update redeem record for ${transfer.beneficiaryWalletAddress}: ${error.message}`
        );
        if (existingRedeem) {
          await this.prismaService.beneficiaryRedeem.update({
            where: {
              uuid: existingRedeem.uuid,
            },
            data: {
              status: 'FIAT_TRANSACTION_FAILED',
              isCompleted: false,
              info: {
                ...(typeof existingRedeem.info === 'object' &&
                existingRedeem.info !== null
                  ? existingRedeem.info
                  : {}),
                error: error.message,
                offrampWalletAddress: transfer.vendorWalletAddress,
                date: transfer.date,
                approvalDate: transfer.approvalDate,
                message:
                  'Fiat transfer to field officer failed because of error: ' +
                  error.message,
                transactionHash: null,
                mode: 'MANUAL_BANK_TRANSFER',
              },
              txHash: null,
            },
          });
        }
      }
    }
  }

  private async updateBeneficiaryVendorRedeemRecords(
    transfers: SingleTransfer[],
    txHash: string
  ) {
    for (const transfer of transfers) {
      try {
        // Find vendor
        const vendor = await this.prismaService.vendor.findFirst({
          where: { walletAddress: transfer.vendorWalletAddress },
        });

        if (!vendor) continue;

        // Find existing redeem record
        const existingRedeem =
          await this.prismaService.beneficiaryRedeem.findFirst({
            where: {
              beneficiaryWalletAddress: transfer.beneficiaryWalletAddress,
              vendorUid: vendor.uuid,
              status: 'PENDING',
              isCompleted: false,
              txHash: null,
            },
            orderBy: {
              createdAt: 'desc',
            },
          });

        if (existingRedeem) {
          // Update existing record
          await this.prismaService.beneficiaryRedeem.update({
            where: {
              uuid: existingRedeem.uuid,
            },
            data: {
              txHash,
              isCompleted: true,
              status: 'COMPLETED',
              amount: parseInt(transfer.amount),
              info: {
                ...(typeof existingRedeem.info === 'object' &&
                existingRedeem.info !== null
                  ? existingRedeem.info
                  : {}),
                message: 'Batch transfer completed successfully',
                transactionHash: txHash,
                mode: 'BATCH_TRANSFER',
              },
            },
          });
        } else {
          // Create new record
          await this.prismaService.beneficiaryRedeem.create({
            data: {
              vendorUid: vendor.uuid,
              beneficiaryWalletAddress: transfer.beneficiaryWalletAddress,
              amount: parseInt(transfer.amount),
              transactionType: 'VENDOR_REIMBURSEMENT',
              status: 'COMPLETED',
              isCompleted: true,
              txHash,
              info: {
                message: 'Batch transfer completed successfully',
                transactionHash: txHash,
                mode: 'BATCH_TRANSFER',
              },
            },
          });
        }
      } catch (error) {
        this.logger.error(
          `Failed to update redeem record for ${transfer.beneficiaryWalletAddress}: ${error.message}`,
          BatchTokenTransferProcessor.name
        );
      }
    }
  }

  private generateMultiCallData(
    contract: ethers.Contract,
    functionName: string,
    callData: any[][]
  ) {
    const encodedData: string[] = [];
    if (callData) {
      for (const callD of callData) {
        const encodedD = contract.interface.encodeFunctionData(functionName, [
          ...callD,
        ]);
        encodedData.push(encodedD);
      }
    }
    return encodedData;
  }

  private async multiSend(
    contract: ethers.Contract,
    functionName: string,
    callData?: any[][]
  ) {
    const encodedData = this.generateMultiCallData(
      contract,
      functionName,
      callData || []
    );
    const tx = await contract.multicall(encodedData);
    const result = await tx.wait();
    return result;
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
      this.logger.error(`Error getting setting ${key}: ${error.message}`);
      throw error;
    }
  }

  private async createContractInstanceSign(
    contractName: string,
    tokenAddress?: string,
    abi?: any
  ) {
    try {
      // Get contract settings
      const contract = await this.getFromSettings('CONTRACT');

      console.log('contract ->>> ', contract);

      const chainConfig = await this.getFromSettings('CHAIN_SETTINGS');
      const deployerPrivateKey = await this.getFromSettings(
        'DEPLOYER_PRIVATE_KEY'
      );

      const contractAddress = tokenAddress || contract.AAPROJECT.ADDRESS;

      const rpcUrl = chainConfig.rpcUrl;

      const privateKey = deployerPrivateKey;

      if (!contractAddress || !rpcUrl || !privateKey) {
        throw new Error(
          `Contract address, RPC URL, or private key not found for ${contractName}`
        );
      }

      // Create provider and signer
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const signer = new ethers.Wallet(privateKey, provider);

      // Get ABI from contract settings and convert it
      const ABI = lowerCaseObjectKeys(abi || contract.AAPROJECT.ABI);

      const contractInstance = new ethers.Contract(
        contractAddress,
        ABI,
        signer
      );

      return { contract: contractInstance };
    } catch (error) {
      this.logger.error(
        `Error creating contract instance for ${contractName}: ${error.message}`,
        error.stack,
        BatchTokenTransferProcessor.name
      );
      throw error;
    }
  }
}

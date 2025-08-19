import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger, Injectable, Inject } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { BQUEUE, CORE_MODULE, JOBS } from '../constants';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { PrismaService } from '@rumsan/prisma';
import {
  VendorOfflinePayoutDto,
  BeneficiaryOtpData,
  CreateClaimDto,
} from '../vendors/dto/vendor-offline-payout.dto';
import { StellarService } from '../stellar/stellar.service';
import { SettingsService } from '@rumsan/settings';
import bcrypt from 'bcryptjs';
import { StellarModule } from '../stellar/stellar.module';

@Processor(BQUEUE.VENDOR_OFFLINE)
@Injectable()
export class VendorOfflinePayoutProcessor {
  private readonly logger = new Logger(VendorOfflinePayoutProcessor.name);

  constructor(
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly prismaService: PrismaService,
    private readonly stellarService: StellarService,
    private readonly settingService: SettingsService,
    @InjectQueue(BQUEUE.VENDOR_OFFLINE)
    private readonly vendorOfflineQueue: Queue
  ) {}

  @Process({ name: JOBS.VENDOR.OFFLINE_PAYOUT, concurrency: 5 })
  async processVendorOfflinePayout(job: Job<VendorOfflinePayoutDto>) {
    const data = job.data;
    this.logger.log(
      `Processing vendor offline payout for group ${data.beneficiaryGroupUuid}`,
      VendorOfflinePayoutProcessor.name
    );

    try {
      // Fetch beneficiary group tokens and payout details
      const beneficiaryGroupTokens =
        await this.prismaService.beneficiaryGroupTokens.findFirst({
          where: { groupId: data.beneficiaryGroupUuid },
          include: {
            payout: true,
            beneficiaryGroup: {
              include: {
                beneficiaries: {
                  include: {
                    beneficiary: true,
                  },
                },
              },
            },
          },
        });

      if (!beneficiaryGroupTokens) {
        throw new Error(
          `No beneficiary group tokens found for group ${data.beneficiaryGroupUuid}`
        );
      }

      const { payout, beneficiaryGroup } = beneficiaryGroupTokens;

      // Validate amount is provided
      if (!data.amount) {
        throw new Error('Amount is required for vendor offline payout');
      }

      // Validate payout type and mode
      // if (payout.type !== 'VENDOR' || payout.mode !== 'OFFLINE') {
      //   throw new Error(
      //     `Invalid payout type or mode. Expected VENDOR/OFFLINE, got ${payout.type}/${payout.mode}`
      //   );
      // }

      // Extract beneficiaries from the group
      const beneficiaries = beneficiaryGroup.beneficiaries.map(
        (bg) => bg.beneficiary
      );

      if (!beneficiaries || beneficiaries.length === 0) {
        throw new Error(
          `No beneficiaries found in group ${data.beneficiaryGroupUuid}`
        );
      }

      this.logger.log(
        `Found ${beneficiaries.length} beneficiaries in group ${data.beneficiaryGroupUuid}`,
        VendorOfflinePayoutProcessor.name
      );

      // Send OTP to all beneficiaries in the group
      const result = await this.sendOtpToGroupDirect(
        beneficiaries,
        '9fc87585-0bb4-41a6-b040-d8c3ffff6440',
        data.amount
      );

      this.logger.log(
        `Successfully processed vendor offline payout for group ${data.beneficiaryGroupUuid}`,
        VendorOfflinePayoutProcessor.name
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to process vendor offline payout for group ${data.beneficiaryGroupUuid}: ${error.message}`,
        error.stack,
        VendorOfflinePayoutProcessor.name
      );
      throw error;
    }
  }

  @Process({ name: JOBS.VENDOR.PROCESS_OFFLINE_TOKEN_TRANSFER, concurrency: 1 })
  async processOfflineTokenTransfer(
    job: Job<{
      offlineRecordUuid: string;
      vendorUuid: string;
      beneficiaryUuid: string;
      amount: number;
      otp: string;
    }>
  ) {
    try {
      const { offlineRecordUuid, vendorUuid, beneficiaryUuid, amount, otp } =
        job.data;

      this.logger.log(
        `Processing offline token transfer for record ${offlineRecordUuid}`,
        VendorOfflinePayoutProcessor.name
      );

      // Get the offline record
      const offlineRecord =
        await this.prismaService.offlineBeneficiaryMCN.findUnique({
          where: { uuid: offlineRecordUuid },
          include: { Beneficiary: true, Vendor: true },
        });

      if (!offlineRecord) {
        throw new Error(`Offline record ${offlineRecordUuid} not found`);
      }

      // Prevent transfer if already SYNCED
      if (offlineRecord.status === 'SYNCED') {
        this.logger.warn(
          `Offline record ${offlineRecordUuid} is already SYNCED. Aborting transfer.`,
          VendorOfflinePayoutProcessor.name
        );
        throw new RpcException(
          'This offline record is already synced. Transfer not allowed.'
        );
      }

      // Get beneficiary and vendor details
      const beneficiary = offlineRecord.Beneficiary;
      const vendorFromRecord = offlineRecord.Vendor;

      if (!beneficiary) {
        throw new Error('Beneficiary not found');
      }
      if (!vendorFromRecord) {
        throw new Error('Vendor not found in offline record');
      }

      // Fetch vendor from vendorUuid (authoritative)
      const vendor = await this.prismaService.vendor.findUnique({
        where: { uuid: vendorUuid },
      });
      if (!vendor) {
        throw new Error(`Vendor with UUID ${vendorUuid} not found`);
      }

      // Check if vendorUuid matches offlineRecord's vendor uuid
      if (vendorFromRecord.uuid !== vendorUuid) {
        this.logger.error(
          `Vendor UUID mismatch: job=${vendorUuid}, record=${vendorFromRecord.uuid}`,
          VendorOfflinePayoutProcessor.name
        );
        // Optionally update status to FAILED here
        await this.prismaService.offlineBeneficiaryMCN.update({
          where: { uuid: offlineRecordUuid },
          data: { status: 'FAILED' },
        });
        throw new RpcException('Vendor UUID mismatch, aborting transfer');
      }

      // Send tokens from beneficiary to vendor using Stellar service (offline flow)
      const transferResult = await this.stellarService.sendAssetToVendor(
        {
          phoneNumber: (beneficiary.extras as any)?.phone || '',
          receiverAddress: vendor.walletAddress,
          amount: amount.toString(),
          otp: otp,
        },
        true
      );

      // Check for existing beneficiaryRedeem record for this transfer
      const existingRedeem =
        await this.prismaService.beneficiaryRedeem.findFirst({
          where: {
            vendorUid: vendorUuid,
            beneficiaryWalletAddress: beneficiary.walletAddress,
            transactionType: 'VENDOR_OFFLINE_PAYOUT',
            txHash: transferResult.txHash,
          },
        });
      if (existingRedeem) {
        this.logger.warn(
          `Beneficiary redeem record already exists for txHash ${transferResult.txHash}. Skipping creation.`,
          VendorOfflinePayoutProcessor.name
        );
      } else {
        // Create beneficiary redeem record for offline flow
        await this.prismaService.beneficiaryRedeem.create({
          data: {
            vendorUid: vendorUuid,
            amount: typeof amount === 'string' ? parseInt(amount, 10) : amount,
            transactionType: 'VENDOR_OFFLINE_PAYOUT',
            beneficiaryWalletAddress: beneficiary.walletAddress,
            txHash: transferResult.txHash,
            isCompleted: true,
            status: 'COMPLETED',
            info: {
              message: 'Offline beneficiary redemption successful',
              transactionHash: transferResult.txHash,
              offrampWalletAddress: vendor.walletAddress,
              beneficiaryWalletAddress: beneficiary.walletAddress,
              otp: otp,
            },
          },
        });
      }

      // Update the offline record status to SYNCED
      await this.prismaService.offlineBeneficiaryMCN.update({
        where: { uuid: offlineRecordUuid },
        data: {
          status: 'SYNCED',
        },
      });

      this.logger.log(
        `Successfully processed offline token transfer for record ${offlineRecordUuid}. Transaction hash: ${transferResult.txHash}`,
        VendorOfflinePayoutProcessor.name
      );

      return {
        success: true,
        offlineRecordUuid,
        transactionHash: transferResult.txHash,
        amount,
        beneficiaryUuid,
        vendorUuid,
      };
    } catch (error) {
      this.logger.error(
        `Failed to process offline token transfer for record ${job.data.offlineRecordUuid}: ${error.message}`,
        error.stack,
        VendorOfflinePayoutProcessor.name
      );

      // Update status to FAILED
      await this.prismaService.offlineBeneficiaryMCN.update({
        where: { uuid: job.data.offlineRecordUuid },
        data: {
          status: 'FAILED',
        },
      });

      throw new RpcException(error.message);
    }
  }

  private async sendOtpToGroupDirect(
    beneficiaries: any[],
    vendorUuid: string,
    amount?: string
  ) {
    this.logger.log(
      `Sending OTP to ${beneficiaries.length} beneficiaries for vendor ${vendorUuid} with amount: ${amount}`,
      VendorOfflinePayoutProcessor.name
    );

    // Verify vendor exists before proceeding
    const vendor = await this.prismaService.vendor.findUnique({
      where: { uuid: vendorUuid },
    });

    if (!vendor) {
      throw new Error(`Vendor with UUID ${vendorUuid} not found`);
    }

    const otpData: BeneficiaryOtpData[] = [];
    const bulkOtpRequests: CreateClaimDto[] = [];

    // Prepare bulk OTP requests
    for (const beneficiary of beneficiaries) {
      try {
        if (!beneficiary.extras.phone) {
          this.logger.warn(
            `Beneficiary ${beneficiary.uuid} has no phone number, skipping...`,
            VendorOfflinePayoutProcessor.name
          );
          continue;
        }

        // Use amount provided in DTO
        const beneficiaryAmount = parseInt(amount);

        if (isNaN(beneficiaryAmount) || beneficiaryAmount <= 0) {
          this.logger.warn(
            `Invalid amount for beneficiary ${beneficiary.uuid}: ${amount}`,
            VendorOfflinePayoutProcessor.name
          );
          continue;
        }

        // Add to bulk OTP requests
        bulkOtpRequests.push({
          phoneNumber: beneficiary.extras.phone,
          amount: beneficiaryAmount.toString(),
        });

        this.logger.log(
          `Added beneficiary ${beneficiary.uuid} to bulk OTP request with amount ${beneficiaryAmount}`,
          VendorOfflinePayoutProcessor.name
        );
      } catch (error) {
        this.logger.error(
          `Failed to prepare OTP for beneficiary ${beneficiary.uuid}: ${error.message}`,
          error.stack,
          VendorOfflinePayoutProcessor.name
        );
      }
    }

    if (bulkOtpRequests.length === 0) {
      this.logger.warn('No valid beneficiaries found for bulk OTP sending');
      return {
        success: true,
        otpData: [],
        totalBeneficiaries: beneficiaries.length,
        successfulOtps: 0,
      };
    }

    try {
      // Send bulk OTP using the new bulk OTP service
      const bulkOtpResult = await lastValueFrom(
        this.client.send(
          { cmd: 'rahat.jobs.otp.send_bulk_otp' },
          { requests: bulkOtpRequests }
        )
      );

      this.logger.log(
        `Bulk OTP sent successfully for ${bulkOtpRequests.length} beneficiaries`,
        VendorOfflinePayoutProcessor.name
      );

      console.log(bulkOtpResult);

      // Process the bulk OTP results and store OTPs
      if (bulkOtpResult && bulkOtpResult.success) {
        for (const request of bulkOtpRequests) {
          const beneficiary = beneficiaries.find(
            (b) => b.extras.phone === request.phoneNumber
          );

          if (beneficiary) {
            try {
              // Store OTP with expiry date (1 month)
              const expiryDate = new Date();
              expiryDate.setMonth(expiryDate.getMonth() + 1);

              // Find the OTP for this request
              const result = bulkOtpResult.results.find(
                (r) => r.phoneNumber === request.phoneNumber && r.success
              );
              if (!result) {
                this.logger.error(
                  `No OTP result found for phone ${request.phoneNumber}`,
                  VendorOfflinePayoutProcessor.name
                );
                continue;
              }

              const otpHash = await bcrypt.hash(
                `${result.otp}:${request.amount}`,
                10
              );

              // Check if record already exists for this beneficiary and vendor
              const existingRecord =
                await this.prismaService.offlineBeneficiaryMCN.findFirst({
                  where: {
                    beneficiaryId: beneficiary.uuid,
                    vendorId: vendorUuid,
                  },
                });

              if (existingRecord) {
                // Update existing record
                await this.prismaService.offlineBeneficiaryMCN.update({
                  where: { uuid: existingRecord.uuid },
                  data: {
                    otpHash,
                    amount: parseInt(request.amount),
                    updatedAt: new Date(),
                  },
                });

                this.logger.log(
                  `Updated existing OTP record for beneficiary ${beneficiary.uuid} and vendor ${vendorUuid}`,
                  VendorOfflinePayoutProcessor.name
                );
              } else {
                // Create new record
                await this.prismaService.offlineBeneficiaryMCN.create({
                  data: {
                    otpHash,
                    vendorId: vendorUuid,
                    beneficiaryId: beneficiary.uuid,
                    amount: parseInt(request.amount),
                    status: 'PENDING',
                  },
                });

                this.logger.log(
                  `Created new OTP record for beneficiary ${beneficiary.uuid} and vendor ${vendorUuid}`,
                  VendorOfflinePayoutProcessor.name
                );
              }

              // Check if beneficiary has existing transaction
              const existingTransaction =
                await this.prismaService.beneficiaryRedeem.findFirst({
                  where: {
                    beneficiaryWalletAddress: beneficiary.walletAddress,
                    transactionType: 'VENDOR_REIMBURSEMENT',
                    txHash: { not: null },
                  },
                  orderBy: { createdAt: 'desc' },
                });

              if (existingTransaction?.txHash) {
                this.logger.log(
                  `Found existing transaction hash ${existingTransaction.txHash} for beneficiary ${beneficiary.uuid}`,
                  VendorOfflinePayoutProcessor.name
                );
              }

              otpData.push({
                phoneNumber: request.phoneNumber,
                walletAddress: beneficiary.walletAddress,
                amount: parseInt(request.amount),
                otpHash,
                expiryDate,
                txHash: existingTransaction?.txHash || null,
              });
            } catch (error) {
              this.logger.error(
                `Failed to store OTP for beneficiary ${beneficiary.uuid}: ${error.message}`,
                error.stack,
                VendorOfflinePayoutProcessor.name
              );
            }
          }
        }
      }

      this.logger.log(
        `Successfully processed OTP for ${otpData.length} out of ${beneficiaries.length} beneficiaries`,
        VendorOfflinePayoutProcessor.name
      );

      return {
        success: true,
        otpData,
        totalBeneficiaries: beneficiaries.length,
        successfulOtps: otpData.length,
        bulkOtpResult,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send bulk OTP: ${error.message}`,
        error.stack,
        VendorOfflinePayoutProcessor.name
      );
      throw error;
    }
  }
}

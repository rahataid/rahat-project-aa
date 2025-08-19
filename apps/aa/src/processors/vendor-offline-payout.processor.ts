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
        payout.payoutProcessorId,
        // 'd87847ea-fcd2-4099-90b2-c7292dfec2ac', // use actual vendor uuid
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
      vendorUuid: string;
      beneficiaryUuid: string;
      amount: number;
      otp: string;
    }>
  ) {
    try {
      const { vendorUuid, beneficiaryUuid, amount, otp } = job.data;

      this.logger.log(
        `Processing offline token transfer for vendor ${vendorUuid}, beneficiary ${beneficiaryUuid}`,
        VendorOfflinePayoutProcessor.name
      );

      // Get beneficiary
      const beneficiary = await this.prismaService.beneficiary.findUnique({
        where: { uuid: beneficiaryUuid },
      });
      if (!beneficiary) {
        throw new Error('Beneficiary not found');
      }

      // Get vendor
      const vendor = await this.prismaService.vendor.findUnique({
        where: { uuid: vendorUuid },
      });
      if (!vendor) {
        throw new Error('Vendor not found');
      }

      // Find the correct beneficiaryRedeem record
      const redeemRecord = await this.prismaService.beneficiaryRedeem.findFirst(
        {
          where: {
            vendorUid: vendorUuid,
            beneficiaryWalletAddress: beneficiary.walletAddress,
            transactionType: 'VENDOR_REIMBURSEMENT',
          },
          orderBy: { createdAt: 'desc' },
        }
      );
      if (!redeemRecord) {
        throw new Error(
          'No pending redeem record found for this beneficiary and vendor'
        );
      }

      // Use StellarService.verifyOTP for OTP validation and marking as verified
      await this.stellarService['verifyOTP'](
        otp,
        (beneficiary.extras as any).phone,
        amount
      );

      // Send tokens from beneficiary to vendor using Stellar service (offline flow)
      const transferResult = await this.stellarService.sendAssetToVendor(
        {
          phoneNumber: (beneficiary.extras as any).phone || '',
          receiverAddress: vendor.walletAddress,
          amount: amount.toString(),
          otp: otp,
        },
        true
      );

      // Update the beneficiaryRedeem record
      await this.prismaService.beneficiaryRedeem.update({
        where: { uuid: redeemRecord.uuid },
        data: {
          txHash: transferResult.txHash,
          isCompleted: true,
          status: 'COMPLETED',
          info: {
            ...(typeof redeemRecord.info === 'object' &&
            redeemRecord.info !== null
              ? redeemRecord.info
              : {}),
            message: 'Offline beneficiary redemption successful',
            transactionHash: transferResult.txHash,
            offrampWalletAddress: vendor.walletAddress,
            beneficiaryWalletAddress: beneficiary.walletAddress,
            otp: otp,
            mode: 'OFFLINE',
          },
        },
      });

      this.logger.log(
        `Successfully processed offline token transfer for beneficiary ${beneficiaryUuid}. Transaction hash: ${transferResult.txHash}`,
        VendorOfflinePayoutProcessor.name
      );

      return {
        success: true,
        transactionHash: transferResult.txHash,
        amount,
        beneficiaryUuid,
        vendorUuid,
      };
    } catch (error) {
      this.logger.error(
        `Failed to process offline token transfer for vendor/beneficiary: ${error.message}`,
        error.stack,
        VendorOfflinePayoutProcessor.name
      );
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
        const beneficiaryAmount = parseInt(amount);
        if (isNaN(beneficiaryAmount) || beneficiaryAmount <= 0) {
          this.logger.warn(
            `Invalid amount for beneficiary ${beneficiary.uuid}: ${amount}`,
            VendorOfflinePayoutProcessor.name
          );
          continue;
        }
        bulkOtpRequests.push({
          phoneNumber: beneficiary.extras.phone,
          amount: beneficiaryAmount.toString(),
        });
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

    let bulkOtpResult = null;
    try {
      // Send bulk OTP using the bulk OTP service
      bulkOtpResult = await lastValueFrom(
        this.client.send(
          { cmd: 'rahat.jobs.otp.send_bulk_otp' },
          { requests: bulkOtpRequests }
        )
      );
      this.logger.log(
        `Bulk OTP sent successfully for ${bulkOtpRequests.length} beneficiaries`,
        VendorOfflinePayoutProcessor.name
      );
    } catch (error) {
      this.logger.error(
        `Failed to send bulk OTP: ${error.message}`,
        error.stack,
        VendorOfflinePayoutProcessor.name
      );
      throw error;
    }

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
            // Store OTP in DB
            await this.prismaService.otp.upsert({
              where: { phoneNumber: request.phoneNumber },
              update: {
                otpHash,
                amount: parseInt(request.amount),
                expiresAt: expiryDate,
                isVerified: false,
                updatedAt: new Date(),
              },
              create: {
                phoneNumber: request.phoneNumber,
                otpHash,
                amount: parseInt(request.amount),
                expiresAt: expiryDate,
                isVerified: false,
              },
            });
            // Find or create beneficiaryRedeem record
            let redeemRecord =
              await this.prismaService.beneficiaryRedeem.findFirst({
                where: {
                  vendorUid: vendorUuid,
                  beneficiaryWalletAddress: beneficiary.walletAddress,
                  transactionType: 'VENDOR_REIMBURSEMENT',
                },
                orderBy: { createdAt: 'desc' },
              });
            if (redeemRecord) {
              // Only update if not already completed or pending for this payout
              if (
                redeemRecord.status !== 'COMPLETED' &&
                redeemRecord.status !== 'PENDING'
              ) {
                const infoObj =
                  typeof redeemRecord.info === 'object' &&
                  redeemRecord.info !== null
                    ? redeemRecord.info
                    : {};
                await this.prismaService.beneficiaryRedeem.update({
                  where: { uuid: redeemRecord.uuid },
                  data: {
                    amount: parseInt(request.amount),
                    status: 'PENDING',
                    isCompleted: false,
                    updatedAt: new Date(),
                    info: { ...infoObj, mode: 'OFFLINE' },
                  },
                });
              }
            } else {
              await this.prismaService.beneficiaryRedeem.create({
                data: {
                  vendorUid: vendorUuid,
                  beneficiaryWalletAddress: beneficiary.walletAddress,
                  amount: parseInt(request.amount),
                  transactionType: 'VENDOR_REIMBURSEMENT',
                  status: 'PENDING',
                  isCompleted: false,
                  info: { mode: 'OFFLINE' },
                },
              });
            }
            otpData.push({
              phoneNumber: request.phoneNumber,
              walletAddress: beneficiary.walletAddress,
              amount: parseInt(request.amount),
              otpHash,
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
  }
}

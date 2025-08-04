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

      // if (!beneficiaryGroupTokens) {
      //   throw new Error(
      //     `No beneficiary group tokens found for group ${data.beneficiaryGroupUuid}`
      //   );
      // }

      const { payout, beneficiaryGroup } = beneficiaryGroupTokens;

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
        payout.payoutProcessorId, // Use vendor UUID directly from payout
        payout.uuid,
        (payout.extras as any)?.amount // Pass the payout amount if available in extras
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

  private async sendOtpToGroupDirect(
    beneficiaries: any[],
    vendorUuid: string,
    payoutUuid: string,
    amount?: string
  ) {
    this.logger.log(
      `Sending OTP to ${beneficiaries.length} beneficiaries for vendor ${vendorUuid}`,
      VendorOfflinePayoutProcessor.name
    );

    const otpData: BeneficiaryOtpData[] = [];
    const bulkOtpRequests: CreateClaimDto[] = [];

    // Prepare bulk OTP requests
    for (const beneficiary of beneficiaries) {
      try {
        if (!beneficiary.phone) {
          this.logger.warn(
            `Beneficiary ${beneficiary.uuid} has no phone number, skipping...`,
            VendorOfflinePayoutProcessor.name
          );
          continue;
        }

        let beneficiaryAmount: number;

        // If amount is provided in DTO, use it; otherwise fetch from beneficiary balance
        if (amount) {
          beneficiaryAmount = parseInt(amount);
        } else {
          // Get beneficiary token balance only when amount is not provided
          beneficiaryAmount = await this.getBeneficiaryBalance(
            beneficiary.phone
          );
        }

        if (beneficiaryAmount <= 0) {
          this.logger.warn(
            `Beneficiary ${beneficiary.uuid} has no balance, skipping...`,
            VendorOfflinePayoutProcessor.name
          );
          continue;
        }

        // Add to bulk OTP requests
        bulkOtpRequests.push({
          phoneNumber: beneficiary.phone,
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

      // Process the bulk OTP results and store OTPs
      if (bulkOtpResult && bulkOtpResult.success) {
        for (const request of bulkOtpRequests) {
          const beneficiary = beneficiaries.find(
            (b) => b.phone === request.phoneNumber
          );

          if (beneficiary) {
            try {
              // Store OTP with expiry date (1 month)
              const expiryDate = new Date();
              expiryDate.setMonth(expiryDate.getMonth() + 1);

              const otpHash = await bcrypt.hash(
                `${bulkOtpResult.otp}:${request.amount}`,
                10
              );

              await this.prismaService.otp.upsert({
                where: { phoneNumber: request.phoneNumber },
                update: {
                  otpHash,
                  amount: parseInt(request.amount),
                  expiresAt: expiryDate,
                  isVerified: false,
                },
                create: {
                  phoneNumber: request.phoneNumber,
                  otpHash,
                  amount: parseInt(request.amount),
                  expiresAt: expiryDate,
                },
              });

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

  public async getBeneficiaryBalance(phoneNumber: string): Promise<number> {
    try {
      // Use the stellar service's getBenTotal function to get beneficiary balance
      return await this.stellarService.getBenTotal(phoneNumber);
    } catch (error) {
      this.logger.error(
        `Failed to get balance for phone ${phoneNumber}: ${error.message}`,
        error.stack,
        VendorOfflinePayoutProcessor.name
      );
      return 0;
    }
  }
}

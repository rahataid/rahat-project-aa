import { Injectable, Logger, Inject } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService, paginator, PaginatorTypes } from '@rumsan/prisma';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { BQUEUE, JOBS } from '../constants';
import {
  CreateVendorTokenRedemptionDto,
  UpdateVendorTokenRedemptionDto,
  GetVendorTokenRedemptionDto,
  ListVendorTokenRedemptionDto,
  GetVendorRedemptionsDto,
  GetVendorTokenRedemptionStatsDto,
  VendorTokenRedemptionStatsResponseDto,
  TokenRedemptionStatus,
} from './dto/vendorTokenRedemption.dto';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class VendorTokenRedemptionService {
  private readonly logger = new Logger(VendorTokenRedemptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(BQUEUE.VENDOR)
    private readonly vendorQueue: Queue
  ) {}

  async create(dto: CreateVendorTokenRedemptionDto) {
    try {
      // Verify vendor exists
      const vendor = await this.prisma.vendor.findUnique({
        where: { uuid: dto.vendorUuid },
      });

      if (!vendor) {
        throw new RpcException(`Vendor with UUID ${dto.vendorUuid} not found`);
      }

      // Create token redemption request
      const redemption = await this.prisma.vendorTokenRedemption.create({
        data: {
          vendorUuid: dto.vendorUuid,
          tokenAmount: dto.tokenAmount,
          redemptionStatus: TokenRedemptionStatus.REQUESTED,
          transactionHash: dto?.transactionHash || null,
        },
        include: {
          vendor: true,
        },
      });

      this.logger.log(
        `Created token redemption request for vendor ${dto.vendorUuid}`
      );

      // Trigger the verification processor immediately after creation
      // The processor will wait for the transaction hash to be provided
      this.vendorQueue.add(
        JOBS.VENDOR.VERIFY_TOKEN_REDEMPTION,
        {
          uuid: redemption.uuid,
          transactionHash: redemption.transactionHash,
        },
        {
          delay: 1000, // 1 second delay
        }
      );

      this.logger.log(
        `Added verification job for token redemption ${redemption.uuid}`
      );

      return redemption;
    } catch (error) {
      this.logger.error(`Error creating token redemption: ${error.message}`);
      throw new RpcException(error.message);
    }
  }

  async findOne(dto: GetVendorTokenRedemptionDto) {
    try {
      const redemption = await this.prisma.vendorTokenRedemption.findUnique({
        where: { uuid: dto.uuid },
        include: {
          vendor: true,
        },
      });

      if (!redemption) {
        throw new RpcException(
          `Token redemption with UUID ${dto.uuid} not found`
        );
      }

      return redemption;
    } catch (error) {
      this.logger.error(`Error finding token redemption: ${error.message}`);
      throw new RpcException(error.message);
    }
  }

  async update(dto: UpdateVendorTokenRedemptionDto) {
    try {
      const redemption = await this.prisma.vendorTokenRedemption.findUnique({
        where: { uuid: dto.uuid },
      });

      if (!redemption) {
        throw new RpcException(
          `Token redemption with UUID ${dto.uuid} not found`
        );
      }

      // Only allow status updates from REQUESTED or STELLAR_VERIFIED to APPROVED or REJECTED
      if (
        redemption.redemptionStatus !== TokenRedemptionStatus.REQUESTED &&
        redemption.redemptionStatus !== TokenRedemptionStatus.STELLAR_VERIFIED
      ) {
        throw new RpcException(
          `Token redemption ${dto.uuid} is not in REQUESTED or STELLAR_VERIFIED status`
        );
      }

      if (
        ![
          TokenRedemptionStatus.APPROVED,
          TokenRedemptionStatus.REJECTED,
          TokenRedemptionStatus.STELLAR_VERIFIED,
          TokenRedemptionStatus.STELLAR_FAILED,
        ].includes(dto.redemptionStatus)
      ) {
        throw new RpcException(
          `Invalid status update. Only APPROVED, REJECTED, STELLAR_VERIFIED, or STELLAR_FAILED status is allowed`
        );
      }

      // Update the redemption status
      const updatedRedemption = await this.prisma.vendorTokenRedemption.update({
        where: { uuid: dto.uuid },
        data: {
          redemptionStatus: dto.redemptionStatus,
          approvedBy: dto.approvedBy,
          approvedAt: new Date(),
          transactionHash: dto.transactionHash,
        },
        include: {
          vendor: true,
        },
      });

      this.logger.log(
        `Updated token redemption ${dto.uuid} to status ${dto.redemptionStatus}`
      );

      return updatedRedemption;
    } catch (error) {
      this.logger.error(`Error updating token redemption: ${error.message}`);
      throw new RpcException(error.message);
    }
  }

  async list(query: ListVendorTokenRedemptionDto) {
    try {
      const {
        vendorUuid,
        redemptionStatus,
        page,
        perPage,
        sort = 'createdAt',
        order = 'desc',
      } = query;

      const where: any = {};

      if (vendorUuid) {
        where.vendorUuid = vendorUuid;
      }

      if (redemptionStatus) {
        where.redemptionStatus = redemptionStatus;
      }

      const orderBy: Record<string, 'asc' | 'desc'> = {};
      orderBy[sort] = order;

      return paginate(
        this.prisma.vendorTokenRedemption,
        {
          where,
          include: {
            vendor: true,
          },
          orderBy,
        },
        {
          page,
          perPage,
        }
      );
    } catch (error) {
      this.logger.error(`Error listing token redemptions: ${error.message}`);
      throw new RpcException(error.message);
    }
  }

  async getVendorRedemptions(dto: GetVendorRedemptionsDto) {
    try {
      const redemptions = await this.prisma.vendorTokenRedemption.findMany({
        where: {
          vendorUuid: dto.vendorUuid,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return redemptions;
    } catch (error) {
      this.logger.error(`Error getting vendor redemptions: ${error.message}`);
      throw new RpcException(error.message);
    }
  }

  async getVendorTokenRedemptionStats(
    dto: GetVendorTokenRedemptionStatsDto
  ): Promise<VendorTokenRedemptionStatsResponseDto> {
    try {
      // Verify vendor exists
      const vendor = await this.prisma.vendor.findUnique({
        where: { uuid: dto.vendorUuid },
      });

      if (!vendor) {
        throw new RpcException(`Vendor with UUID ${dto.vendorUuid} not found`);
      }

      // Get total tokens approved (APPROVED + STELLAR_VERIFIED statuses)
      const totalTokensApproved =
        await this.prisma.vendorTokenRedemption.aggregate({
          where: {
            vendorUuid: dto.vendorUuid,
            redemptionStatus: {
              in: [TokenRedemptionStatus.APPROVED],
            },
          },
          _sum: {
            tokenAmount: true,
          },
        });

      // Get total tokens pending (REQUESTED status)
      const totalTokensPending =
        await this.prisma.vendorTokenRedemption.aggregate({
          where: {
            vendorUuid: dto.vendorUuid,
            redemptionStatus: {
              in: [
                TokenRedemptionStatus.REQUESTED,
                TokenRedemptionStatus.STELLAR_VERIFIED,
              ],
            },
          },
          _sum: {
            tokenAmount: true,
          },
        });

      return {
        totalTokensApproved: totalTokensApproved._sum.tokenAmount || 0,
        totalTokensPending: totalTokensPending._sum.tokenAmount || 0,
      };
    } catch (error) {
      this.logger.error(
        `Error getting vendor token redemption stats: ${error.message}`
      );
      throw new RpcException(error.message);
    }
  }
}

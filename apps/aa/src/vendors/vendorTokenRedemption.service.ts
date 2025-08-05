import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import {
  CreateVendorTokenRedemptionDto,
  UpdateVendorTokenRedemptionDto,
  GetVendorTokenRedemptionDto,
  ListVendorTokenRedemptionDto,
  TokenRedemptionStatus,
} from './dto/vendorTokenRedemption.dto';

@Injectable()
export class VendorTokenRedemptionService {
  private readonly logger = new Logger(VendorTokenRedemptionService.name);

  constructor(private readonly prisma: PrismaService) {}

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
          tokenAddress: dto.tokenAddress,
          notes: dto.notes,
          redemptionStatus: TokenRedemptionStatus.REQUESTED,
        },
        include: {
          vendor: true,
        },
      });

      this.logger.log(
        `Created token redemption request for vendor ${dto.vendorUuid}`
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

      // Update the redemption
      const updatedRedemption = await this.prisma.vendorTokenRedemption.update({
        where: { uuid: dto.uuid },
        data: {
          redemptionStatus: dto.redemptionStatus,
          approvedBy: dto.approvedBy,
          approvedAt:
            dto.redemptionStatus === TokenRedemptionStatus.APPROVED
              ? new Date()
              : null,
          transactionHash: dto.transactionHash,
          notes: dto.notes,
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
      const { vendorUuid, redemptionStatus, page = 1, perPage = 20 } = query;

      const where: any = {
        deletedAt: null,
      };

      if (vendorUuid) {
        where.vendorUuid = vendorUuid;
      }

      if (redemptionStatus) {
        where.redemptionStatus = redemptionStatus;
      }

      const [redemptions, total] = await Promise.all([
        this.prisma.vendorTokenRedemption.findMany({
          where,
          include: {
            vendor: true,
          },
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: {
            createdAt: 'desc',
          },
        }),
        this.prisma.vendorTokenRedemption.count({ where }),
      ]);

      return {
        data: redemptions,
        meta: {
          total,
          page,
          perPage,
          totalPages: Math.ceil(total / perPage),
        },
      };
    } catch (error) {
      this.logger.error(`Error listing token redemptions: ${error.message}`);
      throw new RpcException(error.message);
    }
  }

  async getVendorRedemptions(vendorUuid: string) {
    try {
      const redemptions = await this.prisma.vendorTokenRedemption.findMany({
        where: {
          vendorUuid,
          deletedAt: null,
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

  async approveRedemption(
    uuid: string,
    approvedBy: string,
    transactionHash?: string
  ) {
    try {
      const redemption = await this.prisma.vendorTokenRedemption.findUnique({
        where: { uuid },
      });

      if (!redemption) {
        throw new RpcException(`Token redemption with UUID ${uuid} not found`);
      }

      if (redemption.redemptionStatus !== TokenRedemptionStatus.REQUESTED) {
        throw new RpcException(
          `Token redemption ${uuid} is not in REQUESTED status`
        );
      }

      const updatedRedemption = await this.prisma.vendorTokenRedemption.update({
        where: { uuid },
        data: {
          redemptionStatus: TokenRedemptionStatus.APPROVED,
          approvedBy,
          approvedAt: new Date(),
          transactionHash,
        },
        include: {
          vendor: true,
        },
      });

      this.logger.log(`Approved token redemption ${uuid} by ${approvedBy}`);
      return updatedRedemption;
    } catch (error) {
      this.logger.error(`Error approving token redemption: ${error.message}`);
      throw new RpcException(error.message);
    }
  }

  async rejectRedemption(uuid: string, approvedBy: string, notes?: string) {
    try {
      const redemption = await this.prisma.vendorTokenRedemption.findUnique({
        where: { uuid },
      });

      if (!redemption) {
        throw new RpcException(`Token redemption with UUID ${uuid} not found`);
      }

      if (redemption.redemptionStatus !== TokenRedemptionStatus.REQUESTED) {
        throw new RpcException(
          `Token redemption ${uuid} is not in REQUESTED status`
        );
      }

      const updatedRedemption = await this.prisma.vendorTokenRedemption.update({
        where: { uuid },
        data: {
          redemptionStatus: TokenRedemptionStatus.REJECTED,
          approvedBy,
          approvedAt: new Date(),
          notes,
        },
        include: {
          vendor: true,
        },
      });

      this.logger.log(`Rejected token redemption ${uuid} by ${approvedBy}`);
      return updatedRedemption;
    } catch (error) {
      this.logger.error(`Error rejecting token redemption: ${error.message}`);
      throw new RpcException(error.message);
    }
  }
}

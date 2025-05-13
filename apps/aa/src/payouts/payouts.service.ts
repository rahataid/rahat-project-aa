import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { UpdatePayoutDto } from './dto/update-payout.dto';
import { Payouts } from '@prisma/client';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(private prisma: PrismaService) {}
  

  async create(createPayoutDto: CreatePayoutDto): Promise<Payouts> {
    try {
      this.logger.log(`Creating new payout for group: ${createPayoutDto}`);
      
      const beneficiaryGroup = await this.prisma.beneficiaryGroupTokens.findFirst({
        where: { uuid: createPayoutDto.groupId },
      });

      if (!beneficiaryGroup) {
        throw new RpcException(`Beneficiary group tokens with UUID '${createPayoutDto.groupId}' not found`);
      }

      const payout = await this.prisma.payouts.create({
        data: createPayoutDto,
      });

      this.logger.log(`Successfully created payout with UUID: ${payout.uuid}`);
      return payout;
    } catch (error) {
      this.logger.error(`Failed to create payout: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  async findAll(): Promise<Payouts[]> {
    try {
      this.logger.log('Fetching all payouts');
      
      const payouts = await this.prisma.payouts.findMany({
        include: {
          benefefiaryGroup: true,
        }
      });
      
      this.logger.log(`Successfully fetched ${payouts.length} payouts`);
      return payouts;
    } catch (error) {
      this.logger.error(`Failed to fetch payouts: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(uuid: string): Promise<Payouts> {
    try {
      this.logger.log(`Fetching payout with UUID: '${uuid}'`);
      
      const payout = await this.prisma.payouts.findUnique({
        where: { uuid },
        include: {
          benefefiaryGroup: {
            include: {
              benefefiaryGroup: true,
            }
          },
        }
      });

      if (!payout) {
        this.logger.warn(`Payout not found with UUID: '${uuid}'`);
        throw new RpcException(`Payout with UUID '${uuid}' not found`);
      }

      this.logger.log(`Successfully fetched payout with UUID: '${uuid}'`);
      return payout;
    } catch (error) {
      this.logger.error(`Failed to fetch payout: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  async update(uuid: string, updatePayoutDto: UpdatePayoutDto): Promise<Payouts> {
    try {
      this.logger.log(`Updating payout with UUID: '${uuid}'`);
      
      const existingPayout = await this.prisma.payouts.findUnique({
        where: { uuid },
      });

      if (!existingPayout) {
        this.logger.warn(`Payout not found with UUID: ${uuid}`);
        throw new RpcException(`Payout with UUID '${uuid}' not found`);
      }

      const updatedPayout = await this.prisma.payouts.update({
        where: { uuid },
        data: updatePayoutDto,
      });

      this.logger.log(`Successfully updated payout with UUID: '${uuid}'`);
      return updatedPayout;
    } catch (error) {
      this.logger.error(`Failed to update payout: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }
} 
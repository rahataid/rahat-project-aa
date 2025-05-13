import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { UpdatePayoutDto } from './dto/update-payout.dto';
import { Payouts } from '@prisma/client';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(private prisma: PrismaService) {}
  

  async create(createPayoutDto: CreatePayoutDto): Promise<Payouts> {
    try {
      this.logger.log(`Creating new payout for group: ${createPayoutDto.groupId}`);
      
      const payout = await this.prisma.payouts.create({
        data: createPayoutDto,
      });

      this.logger.log(`Successfully created payout with UUID: ${payout.uuid}`);
      return payout;
    } catch (error) {
      this.logger.error(`Failed to create payout: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findAll(): Promise<Payouts[]> {
    try {
      this.logger.log('Fetching all payouts');
      
      const payouts = await this.prisma.payouts.findMany();
      
      this.logger.log(`Successfully fetched ${payouts.length} payouts`);
      return payouts;
    } catch (error) {
      this.logger.error(`Failed to fetch payouts: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(uuid: string): Promise<Payouts> {
    try {
      this.logger.log(`Fetching payout with UUID: ${uuid}`);
      
      const payout = await this.prisma.payouts.findUnique({
        where: { uuid },
      });

      if (!payout) {
        this.logger.warn(`Payout not found with UUID: ${uuid}`);
        throw new NotFoundException(`Payout with UUID ${uuid} not found`);
      }

      this.logger.log(`Successfully fetched payout with UUID: ${uuid}`);
      return payout;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch payout: ${error.message}`, error.stack);
      throw error;
    }
  }

  async update(uuid: string, updatePayoutDto: UpdatePayoutDto): Promise<Payouts> {
    try {
      this.logger.log(`Updating payout with UUID: ${uuid}`);
      
      // First check if payout exists
      const existingPayout = await this.prisma.payouts.findUnique({
        where: { uuid },
      });

      if (!existingPayout) {
        this.logger.warn(`Payout not found with UUID: ${uuid}`);
        throw new NotFoundException(`Payout with UUID ${uuid} not found`);
      }

      const updatedPayout = await this.prisma.payouts.update({
        where: { uuid },
        data: updatePayoutDto,
      });

      this.logger.log(`Successfully updated payout with UUID: ${uuid}`);
      return updatedPayout;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to update payout: ${error.message}`, error.stack);
      throw error;
    }
  }

  async remove(uuid: string): Promise<Payouts> {
    try {
      this.logger.log(`Deleting payout with UUID: ${uuid}`);
      
      // First check if payout exists
      const existingPayout = await this.prisma.payouts.findUnique({
        where: { uuid },
      });

      if (!existingPayout) {
        this.logger.warn(`Payout not found with UUID: ${uuid}`);
        throw new NotFoundException(`Payout with UUID ${uuid} not found`);
      }

      const deletedPayout = await this.prisma.payouts.delete({
        where: { uuid },
      });

      this.logger.log(`Successfully deleted payout with UUID: ${uuid}`);
      return deletedPayout;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete payout: ${error.message}`, error.stack);
      throw error;
    }
  }
} 
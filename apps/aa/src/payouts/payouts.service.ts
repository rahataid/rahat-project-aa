import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { UpdatePayoutDto } from './dto/update-payout.dto';
import { Payouts, Prisma } from '@prisma/client';
import { RpcException } from '@nestjs/microservices';
import { VendorsService } from '../vendors/vendors.service';
import { isUUID } from 'class-validator';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { PaginatedResult } from '@rumsan/communication/types/pagination.types';
import { AppService } from '../app/app.service';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 10 });

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private prisma: PrismaService,
    private vendorsService: VendorsService,
    private appService: AppService,
    private httpService: HttpService
  ) {}

  async create(payload: CreatePayoutDto): Promise<Payouts> {
    const {groupId, ...createPayoutDto} = payload;
    try {
      this.logger.log(
        `Creating new payout for group: ${JSON.stringify(createPayoutDto)}`
      );

      const beneficiaryGroup =
        await this.prisma.beneficiaryGroupTokens.findFirst({
          where: { uuid: groupId },
        });

      if (!beneficiaryGroup) {
        throw new RpcException(
          `Beneficiary group tokens with UUID '${groupId}' not found`
        );
      }
      const existingPayout = await this.prisma.payouts.findFirst({
        where: { beneficiaryGroupToken: { uuid: groupId } },
      });

      if (existingPayout) {
        throw new RpcException(
          `Payout with groupId '${groupId}' already exists`
        );
      }

      /*
       * FSP Payout is done by the Offramp service so
       * we need to check and store the payout processor id
       * it be either id for ConnectIPS, Khalti and so on
       */
      if (createPayoutDto.type === 'FSP') {
        if (!createPayoutDto.payoutProcessorId) {
          throw new RpcException(
            `Payout processor ID is required for FSP payout`
          );
        }
      } else {
        /*
         * Offline Payout is done by the vendor so
         * we need to check and store the payout processor id which is vendor id
         * If the 'type' is Vendor and mode is OFFLINE
         */
        if (createPayoutDto.mode === 'OFFLINE') {
          if (!createPayoutDto.payoutProcessorId) {
            throw new RpcException(
              `Payout processor ID is required for OFFLINE payout`
            );
          }

          if (!isUUID(createPayoutDto.payoutProcessorId)) {
            throw new RpcException(`Payout processor ID is not a valid UUID`);
          }

          const vendor = await this.vendorsService.findOne(
            createPayoutDto.payoutProcessorId
          );

          if (!vendor) {
            throw new RpcException(
              `Vendor with ID '${createPayoutDto.payoutProcessorId}' not found`
            );
          }
        }
      }

      const payout = await this.prisma.payouts.create({
        data: {
          ...createPayoutDto,
          beneficiaryGroupToken: {
            connect: { uuid: groupId },
          },
        },
      });

      this.logger.log(`Successfully created payout with UUID: ${payout.uuid}`);
      return payout;
    } catch (error) {
      this.logger.error(
        `Failed to create payout: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async findAll(
    payload: { page?: number; perPage?: number } = { page: 1, perPage: 10 }
  ): Promise<PaginatedResult<Payouts>> {
    try {
      this.logger.log('Fetching all payouts');

      const { page, perPage } = payload;

      const query: Prisma.PayoutsFindManyArgs = {
        include: {
          beneficiaryGroupToken: {
            select: {
              uuid: true,
              status: true,
              numberOfTokens: true,
              isDisbursed: true,
              createdBy: true,
              beneficiaryGroup: {
                include: {
                  _count: {
                    select: {
                      beneficiaries: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      };
      
      const result: PaginatedResult<Payouts> = await paginate(
        this.prisma.payouts,
        query,
        {
          page,
          perPage,
        }
      );

      this.logger.log(`Successfully fetched ${result.data.length} payouts`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to fetch payouts: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  async findOne(uuid: string): Promise<Payouts> {
    try {
      this.logger.log(`Fetching payout with UUID: '${uuid}'`);

      const payout = await this.prisma.payouts.findUnique({
        where: { uuid },
        include: {
          beneficiaryGroupToken: {
            include: {
              beneficiaryGroup: {
                include: {
                  beneficiaries: true,
                  _count: {
                    select: {
                      beneficiaries: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!payout) {
        this.logger.warn(`Payout not found with UUID: '${uuid}'`);
        throw new RpcException(`Payout with UUID '${uuid}' not found`);
      }

      this.logger.log(`Successfully fetched payout with UUID: '${uuid}'`);
      return payout;
    } catch (error) {
      this.logger.error(
        `Failed to fetch payout: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async update(
    uuid: string,
    updatePayoutDto: UpdatePayoutDto
  ): Promise<Payouts> {
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
      this.logger.error(
        `Failed to update payout: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getPaymentProvider(): Promise<any> {
    const paymentProvider = await this.appService.getSettings({ name: 'PAYMENT_PROVIDERS' });

    if(!paymentProvider) {
      throw new RpcException(`Payment provider not found in settings.`);
    };

    const url = paymentProvider?.value?.url as string;

    if(!url) {
      throw new RpcException(`Payment provider url not found in settings.`);
    }
    try {
      const { data } = await this.httpService.axiosRef.get(`${url}/payment-provider`);
      return data;
    } catch (error) {
      throw new RpcException(`Failed to fetch payment provider: ${error.message}`);
    }
  }
}

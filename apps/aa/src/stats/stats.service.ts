import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { StatDto } from './dto/stat.dto';

import { CommunicationService } from '@rumsan/communication/services/communication.client';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { JOBS, TRIGGGERS_MODULE } from '../constants';
import { firstValueFrom } from 'rxjs';
import { Prisma } from '@prisma/client';

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);
  private communicationService: CommunicationService;

  constructor(
    private prismaService: PrismaService,
    private configService: ConfigService,
    @Inject(TRIGGGERS_MODULE) private readonly client: ClientProxy
  ) {
    this.communicationService = new CommunicationService({
      baseURL: this.configService.get('COMMUNICATION_URL'),
      headers: {
        appId: this.configService.get('COMMUNICATION_APP_ID'),
      },
    });
  }
  async save(data: StatDto) {
    this.logger.log('Received stat for save:', data);
    data.name = data.name.toUpperCase();

    return this.prismaService.stats.upsert({
      where: { name: data.name },
      update: data,
      create: data,
    });
  }

  async saveMany(stats: StatDto[]) {
    this.logger.log('Received stats for saveMany:', stats.length);
    const formattedStats = stats.map((stat) => ({
      ...stat,
      name: stat.name.toUpperCase(),
    }));

    const group = formattedStats[0]?.group;
    if (group) {
      await this.prismaService.stats.deleteMany({
        where: { group },
      });
    }

    return this.prismaService.stats.createMany({
      data: formattedStats,
      skipDuplicates: true,
    });
  }

  getByGroup(
    group: string,
    select: { name?: boolean; data?: boolean; group?: boolean } | null = null
  ) {
    this.logger.log(
      `Fetching stats for group: ${group} with select: ${JSON.stringify(
        select
      )}`
    );
    return this.prismaService.stats.findMany({
      where: { group },
      select,
    });
  }

  async findAll(payload) {
    this.logger.log('Received payload for findAll:', payload);
    let benefStats;
    let tokenStats;
    try {
      benefStats = await this.prismaService.stats.findMany();
      tokenStats = await this.getTokenStats();
      const triggeersStats = await firstValueFrom(
        this.client.send({ cmd: JOBS.STATS.MS_TRIGGERS_STATS }, payload)
      );
      return {
        benefStats,
        triggeersStats,
        tokenStats,
      };
    } catch (error) {
      this.logger.error('Error from microservice:', error);
      return {
        benefStats,
        tokenStats,
      };
    }
  }

  async mapLocation(payload) {
    this.logger.log('Received payload for mapLocation:', payload);
    const { ward_no, location } = payload;

    try {
      const whereClause: Prisma.StatsWhereInput = {
        group: 'beneficiary_gps_location',

        ...(ward_no && {
          name: {
            contains: `WARD${ward_no}`,
            mode: Prisma.QueryMode.insensitive,
          },
        }),
      };

      const mapLocation = await this.prismaService.stats.findMany({
        where: whereClause,
      });

      return mapLocation;
    } catch (error) {
      this.logger.error('Error from microservice:', error);
      throw error;
    }
  }

  findOne(payload: { name: string }) {
    const { name } = payload;
    return this.prismaService.stats.findUnique({
      where: { name },
    });
  }

  remove(name: string) {
    return this.prismaService.stats.delete({
      where: { name },
    });
  }

  async getTokenStats() {
    const REDEEMED_LEGS = [
      { transactionType: 'VENDOR_REIMBURSEMENT', status: 'COMPLETED' },
      {
        transactionType: 'FIAT_TRANSFER',
        status: 'FIAT_TRANSACTION_COMPLETED',
      },
    ] as const;
    let assignedTokens = 0;
    let disbursedTokens = 0;
    let redeemedTokens = 0;

    const groupTokens =
      await this.prismaService.beneficiaryGroupTokens.findMany({
        select: {
          numberOfTokens: true,
          isDisbursed: true,
          payout: { select: { type: true, mode: true } },
        },
      });
    for (const gt of groupTokens) {
      const tokens = gt.numberOfTokens || 0;
      assignedTokens += tokens;
      if (gt.isDisbursed) disbursedTokens += tokens;
    }
    const pendingDisbursement = assignedTokens - disbursedTokens;

    const redeemRecords = await this.prismaService.beneficiaryRedeem.findMany({
      where: { OR: [...REDEEMED_LEGS] },
      select: {
        amount: true,
        transactionType: true,
        beneficiaryWalletAddress: true,
        payout: { select: { mode: true } },
      },
    });

    for (const r of redeemRecords) {
      redeemedTokens += r.amount;
    }
    const result = {
      assignedTokens,
      disbursedTokens,
      pendingDisbursement,
      redeemedTokens,
    };
    return result;
  }
}

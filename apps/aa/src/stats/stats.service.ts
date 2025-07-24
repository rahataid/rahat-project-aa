import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { StatDto } from './dto/stat.dto';

import { CommunicationService } from '@rumsan/communication/services/communication.client';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { TRIGGGERS_MODULE } from '../constants';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class StatsService {
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
    data.name = data.name.toUpperCase();

    return this.prismaService.stats.upsert({
      where: { name: data.name },
      update: data,
      create: data,
    });
  }

  getByGroup(
    group: string,
    select: { name?: boolean; data?: boolean; group?: boolean } | null = null
  ) {
    return this.prismaService.stats.findMany({
      where: { group },
      select,
    });
  }

  async findAll(payload) {
    try {
      const benefStats = await this.prismaService.stats.findMany();
      const triggeersStats = await firstValueFrom(
        this.client.send({ cmd: 'rahat.jobs.ms.trigggers.stats' }, payload)
      );
      return {
        benefStats,
        triggeersStats,
      };
    } catch (error) {
      console.error('Error from microservice:', error);
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
}

import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy } from '@nestjs/microservices';
import { BQUEUE } from '@rahataid/sdk';
import { PrismaService } from '@rumsan/prisma';
import { Queue } from 'bull';
import { CORE_MODULE } from '../constants';
import { UpdateGrievanceStatusDto } from './dto/udpate-grievance-statuts.dto';

@Injectable()
export class GrievancesService {
  private rsprisma;

  constructor(
    protected prisma: PrismaService,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    @InjectQueue(BQUEUE.RAHAT) private readonly contractQueue: Queue,
    private eventEmitter: EventEmitter2
  ) {
    this.rsprisma = prisma.rsclient;
  }

  async create(data: any) {
    return this.prisma.grievance.create({ data });
  }

  async listAll() {
    return this.prisma.grievance.findMany();
  }

  async updateStatus(dto: UpdateGrievanceStatusDto) {
    const { id, ...updateDto } = dto;

    return this.prisma.grievance.update({
      where: { id },
      data: updateDto,
    });
  }
}

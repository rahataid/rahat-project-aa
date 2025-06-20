import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy } from '@nestjs/microservices';
import { BQUEUE } from '@rahataid/sdk';
import { PrismaService } from '@rumsan/prisma';
import { Queue } from 'bull';
import { CORE_MODULE } from '../constants';
import { handleMicroserviceCall } from '../utils/handleMicroServiceCall';
import { UpdateGrievanceStatusDto } from './dto/update-grievance-statuts.dto';
import { UpdateGrievanceDto } from './dto/update-grievance.dto';

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
    return this.prisma.$transaction(async (tx) => {
      const grievance = await tx.grievance.create({ data });
      await handleMicroserviceCall({
        client: this.client.send(
          { cmd: 'rahat.jobs.grievance.created' },
          grievance
        ),
        onSuccess: async (res) => {
          console.log('Grievance created successfully', grievance);
        },
        onError: (error) => {
          console.error('Error creating grievance:', error);
        },
      });

      return grievance;
    });
  }

  async listAll() {
    return this.prisma.grievance.findMany({ where: { deletedAt: null } });
  }

  async updateStatus(dto: UpdateGrievanceStatusDto) {
    const { id, ...updateDto } = dto;

    return this.prisma.$transaction(async (tx) => {
      const grievance = await tx.grievance.update({
        where: { id },
        data: updateDto,
      });
      await handleMicroserviceCall({
        client: this.client.send(
          { cmd: 'rahat.jobs.grievance.updated' },
          grievance
        ),
        onSuccess: async (res) => {
          console.log('Grievance updated successfully', grievance);
        },
        onError: (error) => {
          console.error('Error updating grievance:', error);
        },
      });
      return grievance;
    });
  }

  async update(dto: UpdateGrievanceDto) {
    const { id, ...updateDto } = dto;

    return this.prisma.$transaction(async (tx) => {
      const grievance = await tx.grievance.update({
        where: { id },
        data: updateDto,
      });
      await handleMicroserviceCall({
        client: this.client.send(
          { cmd: 'rahat.jobs.grievance.updated' },
          grievance
        ),
        onSuccess: async (res) => {
          console.log('Grievance updated successfully', grievance);
        },
        onError: (error) => {
          console.error('Error updating grievance:', error);
        },
      });
      return grievance;
    });
  }

  async findOne(id: number) {
    return this.prisma.grievance.findUnique({ where: { id, deletedAt: null } });
  }

  async remove(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const grievance = await tx.grievance.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await handleMicroserviceCall({
        client: this.client.send(
          { cmd: 'rahat.jobs.grievance.removed' },
          grievance
        ),
        onSuccess: async (res) => {
          console.log('Grievance removed successfully', grievance);
        },
        onError: (error) => {
          console.error('Error removing grievance:', error);
        },
      });
      return grievance;
    });
  }
}

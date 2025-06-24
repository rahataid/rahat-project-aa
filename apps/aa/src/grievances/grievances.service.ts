import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { BQUEUE } from '@rahataid/sdk';
import { PrismaService } from '@rumsan/prisma';
import { Queue } from 'bull';
import { CORE_MODULE } from '../constants';
import { handleMicroserviceCall } from '../utils/handleMicroServiceCall';
import { CreateGrievanceDto } from './dto/create-grievance.dto';
import { UpdateGrievanceStatusDto } from './dto/update-grievance-status.dto';
import { UpdateGrievanceDto } from './dto/update-grievance.dto';
import {
  formatCoreCreateGrievancePayload,
  formatCoreUpdateGrievancePayload,
} from './utils/grievances.service.utils';

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

  async create(data: CreateGrievanceDto) {
    return this.prisma.$transaction(async (tx) => {
      const grievance = await tx.grievance.create({ data });
      console.log('Grievance created successfully', grievance);

      return await handleMicroserviceCall({
        client: this.client.send(
          { cmd: 'rahat.jobs.grievance.created' },
          formatCoreCreateGrievancePayload(grievance)
        ),
        onSuccess: async (res) => {
          console.log('Grievance created successfully', grievance);
          return res;
        },
        onError: async (error) => {
          //TODO: remove grievance from db
          console.log('ERRORssssss', error);
          await tx.grievance.delete({ where: { id: grievance.id } });
          console.error('Error creating grievance:', error);
          throw new RpcException(error);
        },
      });
    });
  }

  async listAll() {
    return this.prisma.grievance.findMany({ where: { deletedAt: null } });
  }

  async updateStatus(dto: UpdateGrievanceStatusDto) {
    const { uuid, ...updateDto } = dto;

    const existingGrievance = await this.prisma.grievance.findUnique({
      where: { uuid },
    });
    if (!existingGrievance) {
      throw new RpcException('Grievance not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const grievance = await tx.grievance.update({
        where: { uuid },
        data: updateDto,
      });

      await handleMicroserviceCall({
        client: this.client.send(
          { cmd: 'rahat.jobs.grievance.updated' },
          formatCoreUpdateGrievancePayload(grievance)
        ),
        onSuccess: async (res) => {
          console.log('Grievance updated successfully', grievance);
          return res;
        },
        onError: (error) => {
          console.error('Error updating grievance:', error);
          tx.grievance.update({
            where: { uuid },
            data: { status: existingGrievance.status },
          });
          throw new RpcException(error);
        },
      });
      return grievance;
    });
  }

  async update(dto: UpdateGrievanceDto) {
    const { uuid, ...updateDto } = dto;

    const existingGrievance = await this.prisma.grievance.findUnique({
      where: { uuid },
    });
    if (!existingGrievance) {
      throw new RpcException('Grievance not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const grievance = await tx.grievance.update({
        where: { uuid },
        data: updateDto,
      });
      await handleMicroserviceCall({
        client: this.client.send(
          { cmd: 'rahat.jobs.grievance.updated' },
          formatCoreUpdateGrievancePayload(grievance)
        ),
        onSuccess: async (res) => {
          console.log('Grievance updated successfully', grievance);
          return res;
        },
        onError: (error) => {
          console.error('Error updating grievance:', error);
          tx.grievance.update({
            where: { uuid },
            data: updateDto,
          });
          throw new RpcException(error);
        },
      });
      return grievance;
    });
  }

  async findOne(uuid: string) {
    return this.prisma.grievance.findUnique({
      where: { uuid, deletedAt: null },
    });
  }

  async remove(uuid: string) {
    return this.prisma.$transaction(async (tx) => {
      const grievance = await tx.grievance.update({
        where: { uuid },
        data: { deletedAt: new Date() },
      });
      await handleMicroserviceCall({
        client: this.client.send(
          { cmd: 'rahat.jobs.grievance.removed' },
          grievance
        ),
        onSuccess: async (res) => {
          console.log('Grievance removed successfully', grievance);
          return res;
        },
        onError: (error) => {
          console.error('Error removing grievance:', error);
          throw new RpcException(error);
        },
      });
      return grievance;
    });
  }
}

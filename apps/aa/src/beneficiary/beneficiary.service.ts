import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { UUID } from 'crypto';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { ProjectContants } from "@rahataid/sdk"
import { ClientProxy } from '@nestjs/microservices';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class BeneficiaryService {
  private rsprisma;
  constructor(
    protected prisma: PrismaService,
    @Inject(ProjectContants.ELClient) private readonly client: ClientProxy,
    private eventEmitter: EventEmitter2
  ) {
    this.rsprisma = prisma.rsclient;
  }

  async create(dto: CreateBeneficiaryDto) {
    return this.rsprisma.beneficiary.create({
      data: dto,
    });
  }

  async createMany(dto) {
    return this.rsprisma.beneficiary.createMany({ data: dto })
  }

  async findAll(data) {
    const localData = await this.rsprisma.beneficiary.findMany({ where: { type: data?.status, deletedAt: null } });

    const projectData = {
      data: localData
    }

    return this.client.send(
      { cmd: 'rahat.jobs.beneficiary.list_by_project' },
      projectData
    );
  }

  async findByUUID(uuid: UUID) {
    return await this.rsprisma.beneficiary.findUnique({ where: { uuid } });
  }

  async findOne(payload) {
    const { uuid, data } = payload;
    const projectBendata = await this.rsprisma.beneficiary.findUnique({ where: { uuid } });
    if (data) return { ...data, ...projectBendata }
    return projectBendata

  }

  async update(id: number, updateBeneficiaryDto: UpdateBeneficiaryDto) {
    return await this.rsprisma.beneficiary.update({
      where: { id: id },
      data: { ...updateBeneficiaryDto },
    });
  }

  async remove(payload: any) {
    const uuid = payload.uuid;
    const findUuid = await this.rsprisma.beneficiary.findUnique({
      where: {
        uuid,
      },
    });

    if (!findUuid) throw new Error('Data not Found');

    const rdata = await this.rsprisma.beneficiary.update({
      where: {
        uuid,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return rdata;
  }
}

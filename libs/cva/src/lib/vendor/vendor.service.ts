import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy } from '@nestjs/microservices';
import { ProjectContants } from '@rahataid/sdk';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { CVA_EVENTS } from '../constants';
import { CreateVendorDto, GetVendorDto } from '../dtos';
import { PaginationBaseDto } from '../dtos/common';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class CvaVendorService {
  public rsprisma: typeof this.prisma.rsclient;

  constructor(
    private prisma: PrismaService,
    @Inject(ProjectContants.ELClient) private readonly client: ClientProxy,
    private eventEmitter: EventEmitter2
  ) {
    this.rsprisma = prisma.rsclient;
  }

  async create(dto: CreateVendorDto) {
    const payload = {
      uuid: dto.uuid,
      walletAddress: dto.walletAddress,
      name: dto.vendor?.['name'],
      phone: dto?.vendor?.['phone'] || '',
      location: dto?.vendor?.['location'] || '',
      extras: dto?.vendor?.['extras'] || {},
    };
    const row = await this.rsprisma.vendor.create({
      data: payload,
    });
    this.eventEmitter.emit(CVA_EVENTS.VENDOR.CREATED);
    return row;
  }

  async listWithProjectData(query: PaginationBaseDto) {
    return paginate(
      this.rsprisma.vendor,
      {
        where: {},
      },
      {
        page: query.page,
        perPage: query.perPage,
      }
    );
  }

  async findOne(payload: GetVendorDto) {
    const { uuid, data } = payload;
    const projectData = await this.rsprisma.vendor.findUnique({
      where: { uuid },
    });
    if (!data) return projectData;
    return { ...data, ...projectData };
  }
}

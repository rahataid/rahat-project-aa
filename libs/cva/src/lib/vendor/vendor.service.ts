import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { ProjectContants } from '@rahataid/sdk';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { CVA_EVENTS } from '../constants';
import { CreateVendorDto, GetVendorDto } from '../dtos';
import { PaginationBaseDto } from '../dtos/common';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class CvaVendorService {
  private readonly logger = new Logger(CvaVendorService.name);
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
    this.eventEmitter.emit(CVA_EVENTS.VENDOR.CREATED, {
      walletAddress: dto.walletAddress,
    });
    return row;
  }

  async createMany(dtos: CreateVendorDto[]) {
    if (!Array.isArray(dtos) || dtos.length === 0) {
      throw new RpcException({
        message: 'At least one vendor is required',
        code: 'VENDOR_BULK_CREATE_EMPTY',
      });
    }

    const data = dtos.map((dto) => ({
      uuid: dto.uuid,
      walletAddress: dto.walletAddress,
      name: dto.vendor?.['name'],
      phone: dto?.vendor?.['phone'] || '',
      location: dto?.vendor?.['location'] || '',
      extras: dto?.vendor?.['extras'] || {},
    }));

    let result: { count: number };
    try {
      result = await this.rsprisma.vendor.createMany({ data });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to create vendors in bulk: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined
      );

      throw new RpcException({
        message: 'Failed to create vendors',
        code: 'VENDOR_BULK_CREATE_FAILED',
        params: { count: dtos.length },
      });
    }

    this.eventEmitter.emit(CVA_EVENTS.VENDOR.CREATED, {
      walletAddresses: dtos.map((dto) => dto.walletAddress),
    });

    return result;
  }

  async listWithProjectData(query: PaginationBaseDto) {
    const { page, perPage, sort, order } = query;

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[sort] = order;

    return paginate(
      this.rsprisma.vendor,
      {
        where: {},
        orderBy,
      },
      {
        page,
        perPage,
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

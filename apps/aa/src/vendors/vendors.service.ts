import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { BQUEUE, DATA_SOURCES, JOBS } from '../constants';
import { RpcException } from '@nestjs/microservices';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';

import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { PhasesService } from '../phases/phases.service';
import { PaginationBaseDto } from './common';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(private prisma: PrismaService) {}

  async listWithProjectData(query: PaginationBaseDto) {
    return paginate(
      this.prisma.vendor,
      {
        where: {
          name: { contains: query.search, mode: 'insensitive' },
        },
      },
      {
        page: query.page,
        perPage: query.perPage,
      }
    );
  }
}

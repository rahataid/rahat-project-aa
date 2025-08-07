import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy } from '@nestjs/microservices';
import { ProjectContants } from '@rahataid/sdk';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { timeout } from 'rxjs';
import { CreateBeneficiaryDto, GetBeneficiaryDto } from '../dtos';
import { CVA_EVENTS, CVA_JOBS } from '../constants';
import { PaginationBaseDto } from '../dtos/common';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class CvaBeneficiaryService {
  public rsprisma: typeof this.prisma.rsclient;

  constructor(
    private prisma: PrismaService,
    @Inject(ProjectContants.ELClient) private readonly client: ClientProxy,
    private eventEmitter: EventEmitter2
  ) {
    this.rsprisma = prisma.rsclient;
  }

  async create(dto: CreateBeneficiaryDto) {
    console.log('Create benef from CVA:', dto);
    const row = await this.rsprisma.beneficiary.create({
      data: dto,
    });
    // if (dto['allowDisbursement']) {
    //   this.eventEmitter.emit(CVA_EVENTS.DISBURSEMENT.INITIATED, {
    //     amount: 50,
    //     walletAddress: row.walletAddress,
    //   });
    // }
    this.eventEmitter.emit(CVA_EVENTS.BENEFICIARY.CREATED);
    return row;
  }

  async findOne(payload: GetBeneficiaryDto) {
    const { uuid, data } = payload;
    const projectBendata = await this.rsprisma.beneficiary.findUnique({
      where: { uuid },
    });
    if (!data) return projectBendata;
    return { ...data, ...projectBendata };
  }

  async listWithPii(query: PaginationBaseDto) {
    console.log('List with PII:', query);
    const { page, perPage, search, order, sort } = query;

    const conditions = {
      deletedAt: null,
      ...(search
        && {
        OR: [
          { walletAddress: { contains: search } },
        ],
      }
      ),
    };

    const beneficiaries = await paginate(
      this.prisma.beneficiary,
      {
        where: conditions,
      ...(order && sort && {
        orderBy: {
          [sort]: order
        },
      })
      },
      {
        page,
        perPage,
      }
    );
    return this.client
      .send({ cmd: CVA_JOBS.BENEFICIARY.LIST_BY_PROJECT }, beneficiaries)
      .pipe(timeout(5000));
  }
}

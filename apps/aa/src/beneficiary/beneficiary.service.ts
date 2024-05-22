import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { UUID } from 'crypto';
import { AddBeneficiaryGroups, AddTokenToGroup, CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { createContractInstanceSign, getContractByName } from '../utils/web3';
import { ProjectContants } from "@rahataid/sdk"
import { ClientProxy, RpcException } from '@nestjs/microservices';

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

  async findAll(dto) {
    const { page, perPage, sort, order } = dto;

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[sort] = order;

    const projectData = await paginate(
      this.rsprisma.beneficiary,
      {
        where: {
          deletedAt: null
        },
        orderBy
      },
      {
        page,
        perPage
      }
    )

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

  // ***** Create beneficiary groups ********** //
  async addGroup(payload: AddBeneficiaryGroups) {
    return await this.prisma.beneficiaryGroups.create({
      data: {
        name: payload.name,
        beneficiary: {
          connect: payload.beneficiaries,
        },
      },
    });
  }

  // Check voucher availability
  async checkVoucherAvailabitliy(name: string, tokens?: number, noOfBen?: number){
    const res = await this.prisma.vouchers.findUnique({
      where: {name}
    })

    const remainingVouchers = res?.totalVouchers - res?.assignedVouchers;
    const vouchersRequested = noOfBen * tokens;

    if(remainingVouchers < vouchersRequested){
      throw new RpcException("Voucher not enough");
    }    

    await this.prisma.vouchers.update({
      where: {name},
      data: {assignedVouchers: {increment: vouchersRequested}}
    })
  }


  // Assign token to beneficiary and group
  async assignTokenToGroup(payload: AddTokenToGroup) {

    const aaContract = await createContractInstanceSign(
      await getContractByName('AAPROJECT', this.prisma.setting),
      this.prisma.setting
    );

    const tokenContractInfo = await getContractByName('RAHATTOKEN', this.rsprisma.setting)
    const tokenAddress = tokenContractInfo.ADDRESS;

    return this.prisma.$transaction(async (prisma) => {
      const group = await prisma.beneficiaryGroups.findUnique({
        where: { uuid: payload.uuid },
        include: { beneficiary: true },
      });

      if (!group || group.beneficiary.length === 0) {
        throw new RpcException('No beneficiaries found in the specified group.');
      }

      const beneficiaryIds = group.beneficiary.map(b => b.id);

      this.checkVoucherAvailabitliy('AaProject', payload?.tokens, beneficiaryIds.length);

      // Contract call
      group.beneficiary.map(async (ben) => {
        const txn = await aaContract.assignClaims(ben.walletAddress, tokenAddress, payload.tokens);
        console.log("Contract called with txn hash:", txn.hash);
        return ben.id;
      })

      await prisma.beneficiary.updateMany({
        where: { id: { in: beneficiaryIds } },
        data: { benTokens: { increment: payload.tokens } },
      });

      const totalTokensToAdd = group.beneficiary.length * payload.tokens;
      const addTokensToGroup = await prisma.beneficiaryGroups.update({
        where: { uuid: payload.uuid },
        data: { groupTokens: { increment: totalTokensToAdd } },
      });

      return addTokensToGroup;
    })

  }
}

import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { UUID } from 'crypto';
import { AddBeneficiaryGroups, AddTokenToGroup, AssignBenfGroupToProject, CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { createContractInstanceSign, getContractByName } from '../utils/web3';
import { ProjectContants } from "@rahataid/sdk"
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { title } from 'process';
import { firstValueFrom, lastValueFrom } from 'rxjs';

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

  async getAllGroups(dto) {
    const { page, perPage, sort, order } = dto;

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[sort] = order;

    const benfGroups = await paginate(
      this.prisma.beneficiaryGroups,
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
      { cmd: 'rahat.jobs.beneficiary.list_group_by_project' },
      benfGroups
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

  // *****  beneficiary groups ********** //
  async getOneGroup(uuid: UUID) {
    const benfGroup = await this.prisma.beneficiaryGroups.findUnique({
      where: {
        uuid: uuid
      }
    })
    if (!benfGroup) throw new RpcException('Beneficiary group not found.')

    return lastValueFrom(this.client.send(
      { cmd: 'rahat.jobs.beneficiary.get_one_group_by_project' },
      benfGroup.uuid
    ));
  }

  async addGroupToProject(payload: AssignBenfGroupToProject) {
    const { beneficiaryGroupData } = payload
    return this.prisma.beneficiaryGroups.create({
      data: {
        uuid: beneficiaryGroupData.uuid
      }
    })
  }

  // async checkVoucherAvailabitliy(name: string, tokens?: number, noOfBen?: number) {
  //   const res = await this.prisma.vouchers.findUnique({
  //     where: { name }
  //   })

  //   const remainingVouchers = res?.totalVouchers - res?.assignedVouchers;
  //   const vouchersRequested = noOfBen * tokens;

  //   if (remainingVouchers < vouchersRequested) {
  //     throw new RpcException("Voucher not enough");
  //   }

  //   await this.prisma.vouchers.update({
  //     where: { name },
  //     data: { assignedVouchers: { increment: vouchersRequested } }
  //   })
  // }


  async reserveTokenToGroup(payload: AddTokenToGroup) {
    const { beneficiaryGroupId, numberOfTokens, title, totalTokensReserved } = payload
    return this.prisma.$transaction(async (prisma) => {
      const group = await this.getOneGroup(beneficiaryGroupId as UUID);

      if (!group || !group?.groupedBeneficiaries) {
        throw new RpcException('No beneficiaries found in the specified group.');
      }

      for (const member of group?.groupedBeneficiaries) {
        const benf = await this.prisma.beneficiary.findUnique({
          where: {
            uuid: member?.beneficiaryId
          }
        })
        if (benf.benTokens > 0) throw new RpcException('Token already assigned to beneficiary.')
      }

      const benfIds = group?.groupedBeneficiaries?.map((d: any) => d?.beneficiaryId)

      await this.prisma.beneficiary.updateMany({
        where: {
          uuid: {
            in: benfIds
          }
        },
        data: {
          benTokens: numberOfTokens
        }
      })

      await this.prisma.beneficiaryGroupTokens.create({
        data: {
          title,
          groupId: beneficiaryGroupId,
          numberOfTokens
        }
      })

      return group
    })
  }

  // // Unused function (only for reference): using reserveTokenToGroup 
  // async assignTokenToGroup(payload: AddTokenToGroup) {

  //   const aaContract = await createContractInstanceSign(
  //     await getContractByName('AAPROJECT', this.prisma.setting),
  //     this.prisma.setting
  //   );

  //   const tokenContractInfo = await getContractByName('RAHATTOKEN', this.rsprisma.setting)
  //   const tokenAddress = tokenContractInfo.ADDRESS;

  //   return this.prisma.$transaction(async (prisma) => {
  //     const group = await prisma.beneficiaryGroups.findUnique({
  //       where: { uuid: payload.uuid },
  //       include: { beneficiary: true },
  //     });

  //     if (!group || group.beneficiary.length === 0) {
  //       throw new RpcException('No beneficiaries found in the specified group.');
  //     }

  //     const beneficiaryIds = group.beneficiary.map(b => b.id);

  //     this.checkVoucherAvailabitliy('AaProject', payload?.tokens, beneficiaryIds.length);

  //     // Contract call
  //     group.beneficiary.map(async (ben) => {
  //       const txn = await aaContract.assignClaims(ben.walletAddress, tokenAddress, payload.tokens);
  //       console.log("Contract called with txn hash:", txn.hash);
  //       return ben.id;
  //     })

  //     await prisma.beneficiary.updateMany({
  //       where: { id: { in: beneficiaryIds } },
  //       data: { benTokens: { increment: payload.tokens } },
  //     });

  //     const totalTokensToAdd = group.beneficiary.length * payload.tokens;
  //     const addTokensToGroup = await prisma.beneficiaryGroups.update({
  //       where: { uuid: payload.uuid },
  //       data: { tokensReserved: { increment: totalTokensToAdd } },
  //     });

  //     return addTokensToGroup;
  //   })

  // }
}

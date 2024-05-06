import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import {
  AddStakeholdersData,
  AddStakeholdersGroups,
  FindStakeholdersGroup,
  GetAllGroups,
  GetStakeholdersData,
  RemoveStakeholdersData,
  RemoveStakeholdersGroup,
  UpdateStakeholdersData,
  UpdateStakeholdersGroups,
} from './dto';
import { RpcException } from '@nestjs/microservices';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class StakeholdersService {
  private readonly logger = new Logger(StakeholdersService.name);

  constructor(
    private prisma: PrismaService,
    private readonly configService: ConfigService
  ) {}

  // ***** stakeholders start ********** //
  async add(payload: AddStakeholdersData) {
    return await this.prisma.stakeholders.create({
      data: payload,
    });
  }

  async getAll(payload: GetStakeholdersData) {
    const { page, perPage } = payload;

    const query = {
      where: {
        isDeleted: false,
      },
      include: {
        stakeholdersGroups: true,
      },
    };

    return paginate(this.prisma.stakeholders, query, {
      page,
      perPage,
    });
  }

  async remove(payload: RemoveStakeholdersData) {
    return await this.prisma.stakeholders.update({
      where: {
        uuid: payload.uuid,
      },
      data: {
        isDeleted: true,
      },
    });
  }

  async update(payload: UpdateStakeholdersData) {
    const {
      uuid,
      designation,
      district,
      email,
      municipality,
      name,
      organization,
      phone,
    } = payload;
    const existingStakeholder = await this.prisma.stakeholders.findUnique({
      where: {
        uuid: uuid,
      },
    });

    if (!existingStakeholder) throw new RpcException('Stakeholder not found!');

    const updatedStakeholder = await this.prisma.stakeholders.update({
      where: {
        uuid: uuid,
      },
      data: {
        name: name || existingStakeholder.name,
        email: email || existingStakeholder.email,
        phone: phone || existingStakeholder.phone,
        designation: designation || existingStakeholder.designation,
        organization: organization || existingStakeholder.organization,
        district: district || existingStakeholder.district,
        municipality: municipality || existingStakeholder.municipality,
        updatedAt: new Date(),
      },
    });

    return updatedStakeholder;
  }
  // ***** stakeholders end ********** //

  // ***** stakeholders groups start ********** //
  async addGroup(payload: AddStakeholdersGroups) {
    return await this.prisma.stakeholdersGroups.create({
      data: {
        name: payload.name,
        stakeholders: {
          connect: payload.stakeholders,
        },
      },
    });
  }

  async updateGroup(payload: UpdateStakeholdersGroups) {
    const { name, stakeholders, uuid } = payload;
    const existingGroup = await this.prisma.stakeholdersGroups.findUnique({
      where: {
        uuid: uuid,
      },
    });

    if (!existingGroup) throw new RpcException('Group not found!');

    const updatedGroup = await this.prisma.stakeholdersGroups.update({
      where: { uuid: uuid },
      data: {
        name: name || existingGroup.name,
        stakeholders: {
          // disconnect all current stakeholders
          set: [],
          // connect new stakeholders
          connect: stakeholders,
        },
        updatedAt: new Date(),
      },
    });
    return updatedGroup;
  }

  async getAllGroups(payload: GetAllGroups) {
    const { page, perPage } = payload;

    const query = {
      where: {
        isDeleted: false,
      },
      include: {
        stakeholders: true,
      },
    };

    return paginate(this.prisma.stakeholdersGroups, query, {
      page,
      perPage,
    });
  }

  async removeGroup(payload: RemoveStakeholdersGroup) {
    const { uuid } = payload;
    return await this.prisma.stakeholdersGroups.update({
      where: {
        uuid: uuid,
      },
      data: {
        isDeleted: true,
      },
    });
  }
  async findGroup(payload: FindStakeholdersGroup) {
    const { uuid } = payload;
    return await this.prisma.stakeholdersGroups.findUnique({
      where: {
        uuid: uuid,
      },
      include: {
        stakeholders: true,
      },
    });
  }
  // ***** stakeholders groups end ********** //
}

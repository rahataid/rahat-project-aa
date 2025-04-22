import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import {
  AddStakeholdersData,
  AddStakeholdersGroups,
  FindStakeholdersGroup,
  GetAllGroups,
  GetOneGroup,
  GetStakeholdersData,
  RemoveStakeholdersData,
  RemoveStakeholdersGroup,
  UpdateStakeholdersData,
  UpdateStakeholdersGroups,
} from './dto';
import { RpcException } from '@nestjs/microservices';
import { CommunicationService } from '@rumsan/communication';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class StakeholdersService {
  private readonly logger = new Logger(StakeholdersService.name);
  private communicationService: CommunicationService;

  constructor(
    private prisma: PrismaService,
    private readonly configService: ConfigService
  ) {
    this.communicationService = new CommunicationService({
      baseURL: this.configService.get('COMMUNICATION_URL'),
      headers: {
        appId: this.configService.get('COMMUNICATION_APP_ID'),
      },
    });
  }

  // ***** stakeholders start ********** //
  async add(payload: AddStakeholdersData) {
    const { phone, ...rest } = payload;
    const validPhone = phone && phone.trim() !== '';
    if (validPhone) {
      const stakeholderWithSamePhone = await this.prisma.stakeholders.findFirst(
        {
          where: {
            phone: payload.phone,
          },
        }
      );
      if (stakeholderWithSamePhone)
        throw new RpcException('Phone number must be unique');
    }

    return await this.prisma.stakeholders.create({
      data: {
        ...rest,
        phone: validPhone ? phone : null,
      },
    });
  }

  async getAll(payload: GetStakeholdersData) {
    const {
      name,
      designation,
      district,
      municipality,
      organization,
      page,
      perPage,
    } = payload;

    const query = {
      where: {
        isDeleted: false,
        ...(name && { name: { contains: name, mode: 'insensitive' } }),
        ...(designation && {
          designation: { contains: designation, mode: 'insensitive' },
        }),
        ...(district && {
          district: { contains: district, mode: 'insensitive' },
        }),
        ...(municipality && {
          municipality: { contains: municipality, mode: 'insensitive' },
        }),
        ...(organization && {
          organization: { contains: organization, mode: 'insensitive' },
        }),
      },
      include: {
        stakeholdersGroups: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    };

    return paginate(this.prisma.stakeholders, query, {
      page,
      perPage,
    });
  }

  async getOne(payload: { uuid: string }) {
    return this.prisma.stakeholders.findUnique({
      where: {
        uuid: payload.uuid,
      },
      include: {
        stakeholdersGroups: true,
      },
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

    const validPhone = phone && phone.trim() !== '';

    if (validPhone) {
      const stakeholderWithSamePhone = await this.prisma.stakeholders.findFirst(
        {
          where: {
            phone: phone,
            uuid: { not: uuid },
          },
        }
      );
      if (stakeholderWithSamePhone)
        throw new RpcException('Phone number must be unique');
    }

    const updatedStakeholder = await this.prisma.stakeholders.update({
      where: {
        uuid: uuid,
      },
      data: {
        name: name || existingStakeholder.name,
        email: email,
        phone: validPhone ? phone : null,
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
        _count: {
          select: {
            stakeholders: {
              where: {
                isDeleted: false,
              },
            },
          },
        },
      },
    };

    return paginate(this.prisma.stakeholdersGroups, query, {
      page,
      perPage,
    });
  }

  async getOneGroup(payload: GetOneGroup) {
    const { uuid } = payload;
    return this.prisma.stakeholdersGroups.findUnique({
      where: {
        uuid: uuid,
      },
      include: {
        stakeholders: {
          where: {
            isDeleted: false,
          },
        },
      },
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
  async findOneGroup(payload: FindStakeholdersGroup) {
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

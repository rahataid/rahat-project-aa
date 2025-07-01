import { ConfigService } from '@nestjs/config';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import {
  AddStakeholdersData,
  AddStakeholdersGroups,
  CreateStakeholderDto,
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
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { ValidateStakeholdersResponse } from './dto/type';

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

  async bulkAdd(payloads: any) {
    this.logger.log('Adding bulk stakeholders...');

    // validate the  parseddata with the stakeholder class
    const rData = await this.validateStakeholders(payloads);

    // Step 1: Clean and normalize input

    const cleanedPayloads = rData.validStakeholders.map(
      ({ phone, email, ...rest }) => {
        let cleanedPhone = phone?.trim() || null;

        // Normalize if it's a 10-digit number
        if (/^\d{10}$/.test(cleanedPhone)) {
          cleanedPhone = `+977${cleanedPhone}`;
        }
        let cleanedEmail = email?.trim().toLowerCase() || null;
        return {
          ...rest,
          email: cleanedEmail,
          phone: cleanedPhone,
        };
      }
    );

    // Step 2: Extract non-null phones
    const phonesToCheck = cleanedPayloads
      .map((p) => p.phone)
      .filter((phone): phone is string => !!phone);

    // Extract non-null email
    const emailsToCheck = cleanedPayloads
      .map((p) => p.email)
      .filter((email): email is string => !!email);

    // Step 3: Check for existing phones in DB
    const existingPhones = await this.prisma.stakeholders.findMany({
      where: {
        phone: { in: phonesToCheck },
      },
      select: { phone: true },
    });

    // Step 4: Check for existing emails if provided
    const existingEmails = emailsToCheck.length
      ? await this.prisma.stakeholders.findMany({
          where: {
            email: { in: emailsToCheck },
          },
          select: { email: true },
        })
      : [];
    const duplicates = {
      phones: existingPhones.map((e) => e.phone),
      emails: existingEmails.map((e) => e.email),
    };

    const duplicateMessages = [];

    if (duplicates.phones.length > 0) {
      duplicateMessages.push(`Phone(s): ${duplicates.phones.join(', ')}`);
    }
    if (duplicates.emails.length > 0) {
      duplicateMessages.push(`Email(s): ${duplicates.emails.join(', ')}`);
    }

    if (duplicateMessages.length > 0) {
      this.logger.warn(
        `Found duplicate entries: ${duplicateMessages.join(' | ')}`
      );
      throw new RpcException(
        `Duplicate(s) found: ${duplicateMessages.join(' | ')}`
      );
    }

    // Step 4: Insert all if no duplicates
    const result = await this.prisma.stakeholders.createMany({
      data: cleanedPayloads,
    });

    return {
      successCount: result.count,
      message: 'All stakeholders successfully added.',
    };
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
      order,
      sort,
      supportArea,
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
        ...(supportArea && { supportArea: { hasSome: [supportArea] } }),
      },
      include: {
        stakeholdersGroups: true,
      },
      ...(order && sort
        ? {
            orderBy: {
              [sort]: order,
            },
          }
        : {
            orderBy: {
              createdAt: 'desc',
            },
          }),
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
      supportArea,
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
        supportArea: supportArea || existingStakeholder.supportArea,
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
    const { page, perPage, order, search, sort } = payload;

    const query = {
      where: {
        isDeleted: false,
        ...(search && {
          name: { contains: search, mode: 'insensitive' },
        }),
      },
      orderBy: {
        ...(order && sort
          ? {
              [sort]: order,
            }
          : {
              createdAt: 'desc',
            }),
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

  async validateStakeholders(
    payload: any[]
  ): Promise<ValidateStakeholdersResponse> {
    const data = payload.map((item) => {
      // Find the first valid supportArea string value
      const rawSupportArea =
        typeof item['Support Area'] === 'string'
          ? item['Support Area']
          : typeof item['Support Area #'] === 'string'
          ? item['Support Area #']
          : typeof item['Support Area '] === 'string'
          ? item['Support Area ']
          : '';

      return {
        name: item['Name']?.trim() || item['Stakeholders Name']?.trim() || '',
        designation: item['Designation']?.trim() || '',
        organization: item['Organization']?.trim() || '',
        district: item['District']?.trim() || '',
        municipality: item['Municipality']?.trim() || '',
        phone:
          item['Mobile #']?.toString().trim() ||
          item['Phone Number']?.toString().trim() ||
          '',
        supportArea: rawSupportArea
          ? rawSupportArea
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
          : [],
        email: item['Email ID']?.trim() || item['Email']?.trim() || '',
      };
    });

    const validationErrors = [];
    const stakeholders = [];
    for (const row of data) {
      const stakeholdersDto = plainToClass(CreateStakeholderDto, row);

      const errors = await validate(stakeholdersDto);
      console.log(errors);

      if (errors.length > 0) {
        validationErrors.push({
          row,
          errors: errors.map((error) => Object.values(error.constraints)),
        });
      } else {
        stakeholders.push(row);
      }
    }
    // If any validation errors, throw exception

    if (validationErrors.length > 0) {
      console.log(validationErrors);

      const errorMessages = validationErrors.map((e, i) => {
        const flattenedErrors = e.errors.flat().join(', ');
        return {
          row: i + 1,
          errors: flattenedErrors,
        };
      });

      throw new RpcException({
        success: false,
        message: 'Validation failed',
        meta: {
          statusCode: 400,
          message: 'Bad Request',
          details: errorMessages,
        },
      });
    }

    return {
      validStakeholders: stakeholders,
    };
  }

  // ***** stakeholders groups end ********** //
}

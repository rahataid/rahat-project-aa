import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import {
  AddStakeholdersData,
  AddStakeholdersGroups,
  BulkAddStakeholdersPayload,
  CreateStakeholderDto,
  FindStakeholdersGroup,
  GetAllGroups,
  getGroupByUuidDto,
  GetOneGroup,
  GetStakeholdersData,
  RemoveStakeholdersData,
  RemoveStakeholdersGroup,
  UpdateStakeholdersData,
  UpdateStakeholdersGroups,
} from './dto';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { CommunicationService } from '@rumsan/communication';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ValidateStakeholdersResponse,
  StakeholderValidationError,
  CleanedStakeholder,
  ValidateBulkStakeholdersResponse,
} from './dto/type';
import { StatsService } from '../stats';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS, JOBS, TRIGGGERS_MODULE } from '../constants';
import { firstValueFrom } from 'rxjs';

type StakeholderImportRow = {
  name?: string;
  email?: string;
  phone?: string | null;
  designation?: string;
  organization?: string;
  district?: string;
  municipality?: string;
  supportArea?: string[];
};

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });
@Injectable()
export class StakeholdersService {
  private readonly logger = new Logger(StakeholdersService.name);
  private communicationService: CommunicationService;

  constructor(
    private prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly statsService: StatsService,
    @Inject(TRIGGGERS_MODULE) private readonly client: ClientProxy,
    private eventEmitter: EventEmitter2
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

    const rData = await this.prisma.stakeholders.create({
      data: {
        ...rest,
        phone: validPhone ? phone : null,
      },
    });

    await this.eventEmitter.emit(EVENTS.STAKEHOLDER_CREATED);

    return rData;
  }

  async validateBulkStakeholders(
    payload: any
  ): Promise<ValidateBulkStakeholdersResponse> {
    this.logger.log('Validating bulk stakeholders...');

    if (!payload || !payload.length) {
      throw new RpcException('No stakeholder data provided for bulk add');
    }

    const errorsMap = new Map<string, StakeholderValidationError>();
    const addError = (error: StakeholderValidationError) => {
      const key = `${error.field}:${error.phone ?? ''}:${error.email ?? ''}:${
        error.message
      }`;
      errorsMap.set(key, error);
    };

    // Step 1: Parse raw rows, then validate — two separate responsibilities
    const parsed = this.parseStakeholderPayload(payload);
    const { errors: dtoErrors } = await this.validateParsedStakeholders(parsed);
    dtoErrors.forEach((e) => addError(e));

    // Step 2: Normalize phones and emails on all parsed rows
    const cleanedPayloads = this.normalizeStakeholders(parsed);

    // Step 3: Intra-payload dedup check
    this.checkIntraPayloadDuplicates(cleanedPayloads, addError);

    // Step 4 & 5: DB lookups
    const { existingByPhone, existingPhoneSet } =
      await this.fetchExistingByPhone(cleanedPayloads);

    // Step 6: Classify into new vs update (unique phones)
    const { newStakeholders, updateStakeholders } = this.classifyStakeholders(
      cleanedPayloads,
      existingPhoneSet
    );

    // Step 7: Check email conflicts in DB
    await this.checkEmailConflicts(cleanedPayloads, existingByPhone, addError);

    const errors = Array.from(errorsMap.values());

    return {
      newStakeholders,
      updateStakeholders,
      cleanedPayloads,
      isValid: errors.length === 0,
      errors,
    };
  }

  async bulkAdd(payload: BulkAddStakeholdersPayload) {
    this.logger.log('Adding bulk stakeholders...');

    if (!payload.data || !payload.data.length) {
      throw new RpcException('No stakeholder data provided for bulk add');
    }

    if (payload?.isGroupCreate) {
      if (!payload?.groupName?.trim()) {
        throw new RpcException(
          'Group name is required when isGroupCreate is true'
        );
      }

      const existingGroup = await this.prisma.stakeholdersGroups.findFirst({
        where: { name: payload.groupName },
      });
      if (existingGroup) {
        throw new RpcException('Group name must be unique');
      }
    }

    // Step 1: Validate using validateBulkStakeholders
    const {
      isValid,
      cleanedPayloads,
      newStakeholders,
      updateStakeholders,
      errors,
    } = await this.validateBulkStakeholders(payload?.data);

    // Step 2: If invalid return structured errors immediately
    if (!isValid) {
      return {
        success: false,
        errors: errors,
      };
    }

    // Step 3: Reuse cleanedPayloads from rData — no redundant validate/normalize call
    // Split using Set.has() O(1) instead of Array.includes() O(n²)
    const newPhoneSet = new Set(newStakeholders);
    const updatePhoneSet = new Set(updateStakeholders);

    const toCreate = cleanedPayloads.filter(
      (p) => p.phone && newPhoneSet.has(p.phone)
    );
    const toUpdate = cleanedPayloads.filter(
      (p) => p.phone && updatePhoneSet.has(p.phone)
    );

    // Step 6: All DB operations inside a single transaction
    await this.prisma.$transaction(async (tx) => {
      // Step 6a: If isGroupCreate, create group first
      let groupUuid: string | null = null;

      if (payload?.isGroupCreate) {
        const group = await tx.stakeholdersGroups.create({
          data: { name: payload?.groupName },
        });
        groupUuid = group.uuid;
      }

      // Step 6b: createMany for new stakeholders
      if (toCreate.length) {
        await tx.stakeholders.createMany({
          data: toCreate.map((s) => this.removeEmptyFields(s)) as any[],
          skipDuplicates: true,
        });

        if (groupUuid) {
          const newPhones = toCreate
            .map((s) => s.phone)
            .filter((p): p is string => !!p);

          const newlyCreated = await tx.stakeholders.findMany({
            where: { phone: { in: newPhones } },
            select: { uuid: true },
          });

          await tx.stakeholdersGroups.update({
            where: { uuid: groupUuid },
            data: {
              stakeholders: {
                connect: newlyCreated.map((s) => ({ uuid: s.uuid })),
              },
            },
          });
        }
      }

      // Step 6d: Update existing stakeholders
      if (toUpdate.length) {
        await Promise.all(
          toUpdate.map((stakeholder) =>
            tx.stakeholders.update({
              where: { phone: stakeholder.phone },
              data: {
                ...this.removeEmptyFields(stakeholder),
                updatedAt: new Date(),
                ...(groupUuid
                  ? { stakeholdersGroups: { connect: { uuid: groupUuid } } }
                  : {}),
              },
            })
          )
        );
      }
    });

    this.logger.log(
      `Bulk import complete: ${toCreate.length} created, ${toUpdate.length} updated`
    );

    await this.eventEmitter.emit(EVENTS.STAKEHOLDER_CREATED);

    // build this response so that frontend is not breaking
    return {
      success: true,
      result: {
        createdCount: toCreate.length,
        updatedCount: toUpdate.length,
      },
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
    const rData = await this.prisma.stakeholders.update({
      where: {
        uuid: payload.uuid,
      },
      data: {
        isDeleted: true,
      },
    });
    await this.eventEmitter.emit(EVENTS.STAKEHOLDER_REMOVED);
    return rData;
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
    await this.eventEmitter.emit(EVENTS.STAKEHOLDER_UPDATED);

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

    const data = {
      ...(name && { name }),
      ...(stakeholders && {
        stakeholders: {
          set: [],
          connect: stakeholders,
        },
      }),
    };

    const updatedGroup = await this.prisma.stakeholdersGroups.update({
      where: { uuid: uuid },
      data,
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

  async getAllGroupsByUuids(payload: getGroupByUuidDto) {
    this.logger.log('Fetching all stakeholders group by group uuids');
    const { uuids, selectField } = payload;
    try {
      let selectFields;

      if (selectField && selectField.length > 0) {
        // Convert fields array into an object for Prisma select
        selectFields = selectField.reduce((acc, field) => {
          acc[field] = true;
          return acc;
        }, {});
      }

      const groups = await this.prisma.stakeholdersGroups.findMany({
        where: {
          uuid: {
            in: uuids,
          },
        },
        ...(selectFields ? { select: selectFields } : {}),
      });

      return groups;
    } catch (err) {
      throw new RpcException(
        `Error while fetching stakeholders groups by uuids. ${err.message}`
      );
    }
  }

  async getGroupDetailsByUuids(payload: { uuids: string[] }) {
    this.logger.log('Fetching all stakeholders group details by group uuids');
    const { uuids } = payload;
    try {
      const groups = await this.prisma.stakeholdersGroups.findMany({
        where: {
          uuid: {
            in: uuids,
          },
          isDeleted: false,
        },
        include: {
          stakeholders: {
            where: {
              isDeleted: false,
            },
          },
        },
      });
      return groups;
    } catch (err) {
      throw new RpcException(
        `Error while fetching stakeholders groups by uuids. ${err.message}`
      );
    }
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
    this.logger.log('Removing stakeholder group...', payload);
    const { uuid } = payload;

    const existingGroup = await this.prisma.stakeholdersGroups.findUnique({
      where: {
        uuid: uuid,
      },
    });

    if (!existingGroup) throw new RpcException('Group not found!');

    const activities = await this.getActivitiesByStakeholderGroupUuid(uuid);

    if (activities && activities?.length > 0) {
      const activitiesNames = activities.map((a) => a.title);
      return {
        isSuccess: false,
        activities: activitiesNames,
      };
    }

    await this.prisma.stakeholdersGroups.update({
      where: {
        uuid: uuid,
      },
      data: {
        isDeleted: true,
      },
    });

    return {
      isSuccess: true,
      activities: [],
    };
  }

  async getActivitiesByStakeholderGroupUuid(uuid: string) {
    try {
      const activities = await firstValueFrom(
        this.client.send(
          { cmd: JOBS.ACTIVITIES.GET_BY_STAKEHOLDER_UUID },
          { stakeholderGroupUuid: uuid }
        )
      );
      return activities;
    } catch (err) {
      throw new RpcException(
        `Error while fetching related activities. ${err.message}`
      );
    }
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

  // Maps raw Excel rows → CreateStakeholderDto shape — no validation
  private parseStakeholderPayload(payload: any[]): CreateStakeholderDto[] {
    return payload.map((item) => {
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
  }

  // Runs class-validator on already-parsed rows — no raw Excel mapping
  private async validateParsedStakeholders(
    data: CreateStakeholderDto[]
  ): Promise<ValidateStakeholdersResponse> {
    const perRowErrors = await Promise.all(
      data.map(async (row) => {
        const stakeholdersDto = plainToClass(CreateStakeholderDto, row);
        const validationErrors = await validate(stakeholdersDto);

        return validationErrors.flatMap((error) =>
          Object.values(error.constraints || {}).map((msg) => ({
            ...(error.property === 'phone'
              ? { phone: row.phone }
              : { email: row.email }),
            field: error.property,
            message: msg,
          }))
        );
      })
    );

    return { errors: perRowErrors.flat() };
  }

  private normalizeStakeholders(
    stakeholders: CreateStakeholderDto[]
  ): CleanedStakeholder[] {
    return stakeholders.map(({ phone, email, ...rest }) => {
      let cleanedPhone = phone?.trim() || null;
      if (cleanedPhone && /^\d{10}$/.test(cleanedPhone)) {
        cleanedPhone = `+977${cleanedPhone}`;
      }
      return {
        ...rest,
        phone: cleanedPhone,
        email: email?.trim().toLowerCase() || null,
      };
    });
  }

  private checkIntraPayloadDuplicates(
    payloads: CleanedStakeholder[],
    addError: (e: StakeholderValidationError) => void
  ): void {
    const seenPhones = new Map<string, number>();
    const seenEmails = new Map<string, number>();

    payloads.forEach((p, index) => {
      if (p.phone) {
        if (seenPhones.has(p.phone)) {
          addError({
            phone: p.phone,
            field: 'phone',
            message: 'Duplicate phone number in upload',
          });
        } else {
          seenPhones.set(p.phone, index);
        }
      }
      if (p.email) {
        if (seenEmails.has(p.email)) {
          addError({
            email: p.email,
            phone: p.phone ?? undefined,
            field: 'email',
            message: 'Duplicate email in upload',
          });
        } else {
          seenEmails.set(p.email, index);
        }
      }
    });
  }

  private async fetchExistingByPhone(payloads: CleanedStakeholder[]) {
    const phonesToCheck = payloads
      .map((p) => p.phone)
      .filter((phone): phone is string => !!phone);

    const existingByPhone = phonesToCheck.length
      ? await this.prisma.stakeholders.findMany({
          where: { phone: { in: phonesToCheck } },
          select: { phone: true, email: true, uuid: true },
        })
      : [];

    const existingPhoneSet = new Set(existingByPhone.map((s) => s.phone));
    return { existingByPhone, existingPhoneSet };
  }

  private classifyStakeholders(
    payloads: CleanedStakeholder[],
    existingPhoneSet: Set<string>
  ): { newStakeholders: string[]; updateStakeholders: string[] } {
    const newStakeholders: string[] = [];
    const updateStakeholders: string[] = [];
    const seenNew = new Set<string>();
    const seenUpdate = new Set<string>();

    for (const p of payloads) {
      if (!p.phone) continue;
      if (existingPhoneSet.has(p.phone)) {
        if (!seenUpdate.has(p.phone)) {
          seenUpdate.add(p.phone);
          updateStakeholders.push(p.phone);
        }
      } else {
        if (!seenNew.has(p.phone)) {
          seenNew.add(p.phone);
          newStakeholders.push(p.phone);
        }
      }
    }

    return { newStakeholders, updateStakeholders };
  }

  private async checkEmailConflicts(
    payloads: CleanedStakeholder[],
    existingByPhone: { phone: string; email: string | null; uuid: string }[],
    addError: (e: StakeholderValidationError) => void
  ): Promise<void> {
    const emailsToCheck = payloads
      .map((p) => p.email)
      .filter((email): email is string => !!email);

    if (!emailsToCheck.length) return;

    const existingByEmail = await this.prisma.stakeholders.findMany({
      where: { email: { in: emailsToCheck } },
      select: { email: true, uuid: true, phone: true },
    });

    const emailToExistingUuid = new Map(
      existingByEmail.map((s) => [s.email, s.uuid])
    );
    const existingPhoneToUuid = new Map(
      existingByPhone.map((s) => [s.phone, s.uuid])
    );

    for (const p of payloads) {
      if (!p.email) continue;

      const existingUuidForEmail = emailToExistingUuid.get(p.email);
      if (!existingUuidForEmail) continue; // email not in DB — no conflict

      const currentUuid = p.phone ? existingPhoneToUuid.get(p.phone) : null;

      if (!currentUuid || currentUuid !== existingUuidForEmail) {
        addError({
          email: p.email,
          phone: p.phone ?? undefined,
          field: 'email',
          message: 'Email already used by another stakeholder',
        });
      }
    }
  }

  removeEmptyFields(obj: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
      Object.entries(obj).filter(
        ([_, value]) => value != null && value !== undefined && value !== ''
      )
    );
  }
  // ***** stakeholders groups end ********** //

  // stakeholders count
  async stakeholdersCount() {
    const countStake = await this.prisma.stakeholders.count({
      where: {
        isDeleted: false,
      },
    });

    return this.statsService.save({
      name: 'stakeholders_total',
      group: 'stakeholders',
      data: { count: countStake },
    });
  }
}

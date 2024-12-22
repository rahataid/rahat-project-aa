import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommunicationService } from '@rumsan/communication/services/communication.client';

import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import {
  ActivityCommunicationData,
  ActivityDocs,
  AddActivityData,
  GetActivitiesDto,
  GetOneActivity,
  RemoveActivityData,
  UpdateActivityData,
} from './dto';
import { StakeholdersService } from '../stakeholders/stakeholders.service';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { ActivitiesStatus } from '@prisma/client';
import { RpcException } from '@nestjs/microservices';
import { randomUUID, UUID } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS } from '../constants';
import { getTriggerAndActivityCompletionTimeDifference } from '../utils/timeDifference';
import { CommsClient } from '../comms/comms.service';
import {
  SessionStatus,
  TransportType,
  TriggerType,
  ValidationAddress,
} from '@rumsan/connect/src/types';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);
  private communicationService: CommunicationService;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private readonly stakeholdersService: StakeholdersService,
    private readonly beneficiaryService: BeneficiaryService,
    private eventEmitter: EventEmitter2,
    @Inject('COMMS_CLIENT')
    private commsClient: CommsClient
  ) {
    this.communicationService = new CommunicationService({
      baseURL: this.configService.get('COMMUNICATION_URL'),
      headers: {
        appId: this.configService.get('COMMUNICATION_APP_ID'),
      },
    });
  }

  async add(payload: AddActivityData) {
    try {
      const {
        activityCommunication,
        title,
        isAutomated,
        leadTime,
        categoryId,
        description,
        phaseId,
        responsibility,
        source,
        activityDocuments,
      } = payload;

      const createActivityCommunicationPayload = [];
      const createActivityPayoutPayload = [];
      const docs = activityDocuments || [];

      if (activityCommunication?.length) {
        for (const comms of activityCommunication) {
          const communicationId = randomUUID();

          createActivityCommunicationPayload.push({
            ...comms,
            communicationId,
          });
        }
      }

      const newActivity = await this.prisma.activities.create({
        data: {
          title,
          description,
          leadTime,
          responsibility,
          source,
          isAutomated,
          category: {
            connect: { uuid: categoryId },
          },
          phase: {
            connect: { uuid: phaseId },
          },
          activityCommunication: JSON.parse(
            JSON.stringify(createActivityCommunicationPayload)
          ),
          activityPayout: createActivityPayoutPayload,
          activityDocuments: JSON.parse(JSON.stringify(docs)),
        },
      });

      this.eventEmitter.emit(EVENTS.ACTIVITY_ADDED, {});
      return newActivity;
    } catch (err) {
      console.log(err);
    }
  }

  async getOne(payload: GetOneActivity) {
    const { uuid } = payload;
    const { activityCommunication: aComm, ...activityData } =
      await this.prisma.activities.findUnique({
        where: {
          uuid: uuid,
        },
        include: {
          category: true,
          phase: true,
        },
      });

    const activityCommunication = [];
    const activityPayout = [];

    if (Array.isArray(aComm) && aComm.length) {
      for (const comm of aComm) {
        const communication = JSON.parse(
          JSON.stringify(comm)
        ) as ActivityCommunicationData & {
          transportId: string;
          sessionId: string;
        };

        let sessionStatus = SessionStatus.NEW;
        if (communication.sessionId) {
          const s = await this.commsClient.session.get(communication.sessionId);
          sessionStatus = s.data.status;
        }
        const transport = await this.commsClient.transport.get(
          communication.transportId
        );

        const transportName = transport.data.name;

        const { group, groupName } = await this.getGroupDetails(
          communication.groupType,
          communication.groupId
        );

        activityCommunication.push({
          ...communication,
          groupName: groupName,
          transportName: transportName,
          sessionStatus,
          ...(communication.sessionId && {
            sessionId: communication.sessionId,
          }),
        });
      }
    }

    return {
      ...activityData,
      activityCommunication,
      activityPayout,
    };
  }

  async getAll(payload: GetActivitiesDto) {
    const {
      page,
      perPage,
      title,
      category,
      phase,
      isComplete,
      isApproved,
      responsibility,
      status,
    } = payload;

    const query = {
      where: {
        isDeleted: false,
        ...(title && { title: { contains: title, mode: 'insensitive' } }),
        ...(category && { categoryId: category }),
        ...(phase && { phaseId: phase }),
        ...(isComplete && { isComplete: isComplete }),
        ...(isApproved && { isApproved: isApproved }),
        ...(responsibility && {
          responsibility: { contains: responsibility, mode: 'insensitive' },
        }),
        ...(status && { status: status }),
      },
      include: {
        category: true,
        phase: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    };

    return paginate(this.prisma.activities, query, {
      page,
      perPage,
    });
  }

  async getHavingComms(payload: GetActivitiesDto) {
    const { page, perPage } = payload;

    const query = {
      where: {
        isDeleted: false,
        activityCommunication: { not: [] },
      },
      include: {
        phase: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    };

    return paginate(this.prisma.activities, query, {
      page,
      perPage,
    });
  }

  async remove(payload: RemoveActivityData) {
    const deletedActivity = await this.prisma.activities.update({
      where: {
        uuid: payload.uuid,
      },
      data: {
        isDeleted: true,
      },
    });

    this.eventEmitter.emit(EVENTS.ACTIVITY_DELETED, {});

    return deletedActivity;
  }

  async triggerCommunication(payload: {
    communicationId: string;
    activityId: string;
  }) {
    const activity = await this.prisma.activities.findUnique({
      where: {
        uuid: payload.activityId,
      },
    });
    if (!activity) throw new RpcException('Activity communication not found.');
    const { activityCommunication } = activity;

    const parsedCommunications = JSON.parse(
      JSON.stringify(activityCommunication)
    ) as Array<{
      groupId: string;
      message:
        | string
        | {
            mediaURL: string;
            fileName: string;
          };
      groupType: 'STAKEHOLDERS' | 'BENEFICIARY';
      transportId: string;
      communicationId: string;
    }>;

    const selectedCommunication = parsedCommunications.find(
      (c) => c?.communicationId === payload.communicationId
    );

    if (!Object.keys(selectedCommunication).length)
      throw new RpcException('Selected communication not found.');

    const transportDetails = await this.commsClient.transport.get(
      selectedCommunication.transportId
    );

    if (!transportDetails.data)
      throw new RpcException('Selected transport not found.');

    const addresses = await this.getAddresses(
      selectedCommunication.groupType,
      selectedCommunication.groupId,
      transportDetails.data.validationAddress as ValidationAddress
    );

    let messageContent: string;
    if (transportDetails.data.type === TransportType.VOICE) {
      const msg = selectedCommunication.message as {
        mediaURL: string;
        fileName: string;
      };
      messageContent = msg.mediaURL;
    } else {
      messageContent = selectedCommunication.message as string;
    }

    const sessionData = await this.commsClient.broadcast.create({
      addresses: addresses,
      maxAttempts: 3,
      message: {
        content: messageContent,
        meta: {
          subject: 'INFO',
        },
      },
      options: {},
      transport: selectedCommunication.transportId,
      trigger: TriggerType.IMMEDIATE,
    });

    const updatedCommunicationsData = parsedCommunications.map((c) => {
      if (c?.communicationId === payload.communicationId) {
        return {
          ...c,
          sessionId: sessionData.data.cuid,
        };
      }
      return c;
    });

    await this.prisma.activities.update({
      where: {
        uuid: payload.activityId,
      },
      data: {
        activityCommunication: updatedCommunicationsData,
      },
    });

    return sessionData.data;
  }

  async getAddresses(
    groupType: 'STAKEHOLDERS' | 'BENEFICIARY',
    groupId: string,
    validationAddress: ValidationAddress
  ) {
    switch (groupType) {
      case 'STAKEHOLDERS':
        const group = await this.prisma.stakeholdersGroups.findUnique({
          where: {
            uuid: groupId,
          },
          include: {
            stakeholders: true,
          },
        });
        if (!group) throw new RpcException('Stakeholders group not found.');
        return group.stakeholders
          .map((stakeholder) => {
            if (validationAddress === ValidationAddress.EMAIL) {
              return stakeholder?.email || null;
            } else if (
              validationAddress === ValidationAddress.PHONE &&
              stakeholder.phone
            ) {
              return stakeholder.phone.substring(
                +stakeholder.phone.length - 10
              );
            } else if (validationAddress === ValidationAddress.ANY) {
              if (stakeholder.phone) {
                return stakeholder.phone
                  ? stakeholder.phone.substring(+stakeholder.phone.length - 10)
                  : null;
              }
            }
            return null;
          })
          .filter(Boolean);
      case 'BENEFICIARY':
        const beneficiaryGroup = await this.beneficiaryService.getOneGroup(
          groupId as UUID
        );
        if (!beneficiaryGroup)
          throw new RpcException('Beneficiary group not found.');
        const groupedBeneficiaries = beneficiaryGroup.groupedBeneficiaries;
        return groupedBeneficiaries
          ?.map((beneficiary) => {
            if (validationAddress === ValidationAddress.EMAIL) {
              return beneficiary.Beneficiary?.pii?.email || null;
            } else if (
              validationAddress === ValidationAddress.PHONE &&
              beneficiary.Beneficiary?.pii?.phone
            ) {
              return beneficiary.Beneficiary?.pii?.phone.substring(
                +beneficiary.Beneficiary?.pii?.phone?.length - 10
              );
            } else if (validationAddress === ValidationAddress.ANY) {
              if (beneficiary.Beneficiary?.pii?.phone) {
                return beneficiary.Beneficiary?.pii?.phone
                  ? beneficiary.Beneficiary?.pii?.phone.substring(
                      +beneficiary.Beneficiary?.pii?.phone.length - 10
                    )
                  : null;
              }
            }
            return null;
          })
          .filter(Boolean);
      default:
        return [];
    }
  }

  async updateStatus(payload: {
    uuid: string;
    status: ActivitiesStatus;
    notes: string;
    activityDocuments: Array<ActivityDocs>;
    user: any;
  }) {
    const { status, uuid, notes, activityDocuments, user } = payload;

    const activity = await this.prisma.activities.findUnique({
      where: {
        uuid: uuid,
      },
    });

    const docs = activityDocuments?.length
      ? activityDocuments
      : activity?.activityDocuments || [];

    if (status === 'COMPLETED') {
      this.eventEmitter.emit(EVENTS.ACTIVITY_COMPLETED, {});
    }

    const updatedActivity = await this.prisma.activities.update({
      where: {
        uuid: uuid,
      },
      data: {
        status: status,
        notes: notes,
        activityDocuments: JSON.parse(JSON.stringify(docs)),
        ...(status === 'COMPLETED' && { completedBy: user?.name }),
        ...(status === 'COMPLETED' && { completedAt: new Date() }),
      },
      include: {
        phase: true,
      },
    });

    if (
      updatedActivity?.status === 'COMPLETED' &&
      !updatedActivity?.differenceInTriggerAndActivityCompletion &&
      updatedActivity?.phase?.activatedAt
    ) {
      const timeDifference = getTriggerAndActivityCompletionTimeDifference(
        updatedActivity.phase.activatedAt,
        updatedActivity.completedAt
      );

      const finalUpdate = await this.prisma.activities.update({
        where: {
          uuid: uuid,
        },
        data: {
          differenceInTriggerAndActivityCompletion: timeDifference,
        },
      });
      return finalUpdate;
    }

    return updatedActivity;
  }

  async update(payload: UpdateActivityData) {
    const {
      uuid,
      activityCommunication,
      isAutomated,
      title,
      source,
      responsibility,
      phaseId,
      leadTime,
      description,
      categoryId,
      activityDocuments,
    } = payload;
    const activity = await this.prisma.activities.findUnique({
      where: {
        uuid: uuid,
      },
    });
    if (!activity) throw new RpcException('Activity not found.');

    const updateActivityCommunicationPayload = [];
    const updateActivityDocuments = activityDocuments?.length
      ? JSON.parse(JSON.stringify(activityDocuments))
      : [];

    if (activityCommunication?.length) {
      for (const comms of activityCommunication) {
        if (comms?.communicationId) {
          updateActivityCommunicationPayload.push(comms);
        } else {
          const communicationId = randomUUID();
          updateActivityCommunicationPayload.push({
            ...comms,
            communicationId,
          });
        }
      }
    }
    return await this.prisma.activities.update({
      where: {
        uuid: uuid,
      },
      data: {
        title: title || activity.title,
        description: description || activity.description,
        source: source || activity.source,
        responsibility: responsibility || activity.responsibility,
        leadTime: leadTime || activity.leadTime,
        isAutomated: isAutomated,
        phase: {
          connect: {
            uuid: phaseId || activity.phaseId,
          },
        },
        category: {
          connect: {
            uuid: categoryId || activity.categoryId,
          },
        },
        activityCommunication: updateActivityCommunicationPayload,
        activityDocuments:
          updateActivityDocuments || activity.activityDocuments,
        updatedAt: new Date(),
      },
    });
  }

  async getSessionLogs(payload: {
    communicationId: string;
    activityId: string;
  }) {
    const { communicationId, activityId } = payload;

    const { selectedCommunication } =
      await this.getActivityCommunicationDetails(communicationId, activityId);

    const { groupName } = await this.getGroupDetails(
      selectedCommunication.groupType,
      selectedCommunication.groupId
    );

    const sessionDetails = (
      await this.commsClient.session.get(selectedCommunication.sessionId)
    ).data;

    const { addresses, ...rest } = sessionDetails;

    return {
      sessionDetails: rest,
      communicationDetail: selectedCommunication,
      groupName,
    };
  }

  async retryFailedBroadcast(payload: {
    communicationId: string;
    activityId: string;
  }) {
    const { communicationId, activityId } = payload;

    const { selectedCommunication } =
      await this.getActivityCommunicationDetails(communicationId, activityId);

    const retryResponse = (
      await this.commsClient.session.retryIncomplete(
        selectedCommunication.sessionId
      )
    ).data;

    return retryResponse;
  }

  async getActivityCommunicationDetails(
    communicationId: string,
    activityId: string
  ) {
    const activity = await this.prisma.activities.findUnique({
      where: {
        uuid: activityId,
      },
    });
    if (!activity) throw new RpcException('Activity communication not found.');
    const { activityCommunication } = activity;

    const parsedCommunications = JSON.parse(
      JSON.stringify(activityCommunication)
    ) as Array<{
      groupId: string;
      message:
        | string
        | {
            mediaURL: string;
            fileName: string;
          };
      groupType: 'STAKEHOLDERS' | 'BENEFICIARY';
      transportId: string;
      communicationId: string;
      sessionId?: string;
    }>;

    const selectedCommunication = parsedCommunications.find(
      (c) => c?.communicationId === communicationId
    );

    if (!Object.keys(selectedCommunication).length)
      throw new RpcException('Selected communication not found.');

    return { selectedCommunication, activity };
  }

  async getGroupDetails(
    groupType: 'STAKEHOLDERS' | 'BENEFICIARY',
    groupId: string
  ) {
    let group: any;
    let groupName: string;
    switch (groupType) {
      case 'STAKEHOLDERS':
        group = await this.prisma.stakeholdersGroups.findUnique({
          where: {
            uuid: groupId,
          },
        });
        groupName = group.name;
        break;
      case 'BENEFICIARY':
        group = await this.prisma.beneficiaryGroups.findUnique({
          where: {
            uuid: groupId,
          },
        });
        groupName = group.name;
        break;
      default:
        break;
    }
    return { group, groupName };
  }

  async getCommsStats() {
    const activitiesHavingComms = await this.prisma.activities.findMany({
      where: {
        isDeleted: false,
        activityCommunication: { not: [] },
      },
      select: {
        uuid: true,
        activityCommunication: true,
        title: true,
      },
    });

    let totalCommsProject = 0;

    for (const activity of activitiesHavingComms) {
      for (const comm of JSON.parse(
        JSON.stringify(activity.activityCommunication)
      )) {
        if (comm?.sessionId) {
          totalCommsProject++;
        }
      }
    }

    return {
      totalCommsProject,
    };
  }
}

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

  async processStakeholdersCommunication(
    payload: ActivityCommunicationData,
    title: string
  ) {
    const transportId = await this.getTransportId(payload.communicationType);

    const { data: audience } =
      await this.communicationService.communication.listAudience();

    const stakeholderGroup = await this.stakeholdersService.findOneGroup({
      uuid: payload.groupId,
    });

    const stakeholderEmails = stakeholderGroup.stakeholders.map(
      (stakeholder) => stakeholder?.email
    );
    const stakeholderPhones = stakeholderGroup.stakeholders.map(
      (stakeholder) => stakeholder?.phone
    );

    const audienceEmails = audience.map((audience) => audience?.details?.email);
    const audiencePhones = audience.map((audience) => audience?.details?.phone);

    // get stakeholders not in audience
    const stakeholdersNotInAudience = stakeholderGroup.stakeholders.filter(
      (stakeholder) => {
        return (
          !audienceEmails.includes(stakeholder?.email) ||
          !audiencePhones.includes(stakeholder?.phone)
        );
      }
    );

    // get audience which already has stakeholders
    const stakeholdersInAudience = audience.filter((audience) => {
      return (
        stakeholderEmails.includes(audience?.details?.email) ||
        stakeholderPhones.includes(audience?.details?.phone)
      );
    });

    const audienceIds = [
      ...stakeholdersInAudience.map((audience) => audience.id),
    ];

    for (const stakeholder of stakeholdersNotInAudience) {
      const response =
        await this.communicationService.communication.createAudience({
          details: {
            name: stakeholder?.name,
            phone: stakeholder?.phone,
            // fix: add email to audience type in sdk
            // @ts-ignore: Unreachable code error
            email: stakeholder?.email,
          },
        });
      audienceIds.push(response.data.id);
    }

    const campaignPayload = {
      audienceIds: audienceIds,
      name: title,
      status: 'ONGOING',
      transportId: transportId,
      type: payload.communicationType.toUpperCase(),
      details: {
        message: '',
        ivrFileName: '',
        ivrMediaURL: '',
      },
      file: {},
      startTime: new Date(),
    };

    if (payload.message) {
      campaignPayload.details.message = payload.message;
    }

    if (payload.audioURL) {
      campaignPayload.file = payload.audioURL;
    }

    //create campaign
    const campaign =
      await this.communicationService.communication.createCampaign(
        campaignPayload
      );
    return campaign.data.id;
  }

  async processBeneficiaryCommunication(
    payload: ActivityCommunicationData,
    title: string
  ) {
    const transportId = await this.getTransportId(payload.communicationType);
    const { data: audience } =
      await this.communicationService.communication.listAudience();
    const beneficiaryGroup = await this.beneficiaryService.getOneGroup(
      payload.groupId as UUID
    );
    const groupedBeneficiaries = beneficiaryGroup.groupedBeneficiaries;

    const beneficiaryEmails = groupedBeneficiaries.map(
      (beneficiary) => beneficiary.Beneficiary?.pii?.email
    );
    const beneficiaryPhones = groupedBeneficiaries.map(
      (beneficiary) => beneficiary.Beneficiary?.pii?.phone
    );

    const audienceEmails = audience.map((audience) => audience?.details?.email);
    const audiencePhones = audience.map((audience) => audience?.details?.phone);

    // get beneficiaries not in audience
    const beneficiariesNotInAudience = groupedBeneficiaries.filter(
      (beneficiary) => {
        return (
          !audienceEmails.includes(beneficiary?.Beneficiary?.pii?.email) ||
          !audiencePhones.includes(beneficiary?.Beneficiary?.pii?.phone)
        );
      }
    );

    // get audience which already has beneficiaries
    const beneficiariesInAudience = audience.filter((audience) => {
      return (
        beneficiaryEmails.includes(audience?.details?.email) ||
        beneficiaryPhones.includes(audience?.details?.phone)
      );
    });

    const audienceIds = [
      ...beneficiariesInAudience.map((audience) => audience.id),
    ];

    for (const beneficiary of beneficiariesNotInAudience) {
      const response =
        await this.communicationService.communication.createAudience({
          details: {
            name: beneficiary?.Beneficiary?.pii?.name,
            phone: beneficiary?.Beneficiary?.pii?.phone,
            // fix: add email to audience type in sdk
            // @ts-ignore: Unreachable code error
            email: beneficiary?.Beneficiary?.pii?.email,
          },
        });
      audienceIds.push(response.data.id);
    }

    const campaignPayload = {
      audienceIds: audienceIds,
      name: title,
      status: 'ONGOING',
      transportId: transportId,
      type: payload.communicationType.toUpperCase(),
      details: {
        message: '',
        ivrFileName: '',
        ivrMediaURL: '',
      },
      file: {},
      startTime: new Date(),
    };

    if (payload.message) {
      campaignPayload.details.message = payload.message;
    }

    if (payload.audioURL) {
      campaignPayload.file = payload.audioURL;
    }

    //create campaign
    const campaign =
      await this.communicationService.communication.createCampaign(
        campaignPayload
      );
    return campaign.data.id;
  }

  async getTransportId(transportName: string) {
    const transports =
      await this.communicationService.communication.listTransport();
    const t = transports.data.find(
      (d) => d.name.toLowerCase() === transportName.toLowerCase()
    );
    return t.id;
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

        let group: any;
        let groupName: string;

        switch (communication.groupType) {
          case 'STAKEHOLDERS':
            group = await this.prisma.stakeholdersGroups.findUnique({
              where: {
                uuid: communication.groupId,
              },
            });
            groupName = group.name;
            break;
          case 'BENEFICIARY':
            group = await this.prisma.beneficiaryGroups.findUnique({
              where: {
                uuid: communication.groupId,
              },
            });
            groupName = group.name;
            break;
          default:
            break;
        }

        activityCommunication.push({
          ...communication,
          groupName: groupName,
          transportName: transportName,
          sessionStatus,
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
      message: string;
      audioURL: Record<string, string>;
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

    if(!transportDetails.data) throw new RpcException('Selected transport not found.')

    const addresses = await this.getAddresses(
      selectedCommunication.groupType,
      selectedCommunication.groupId,
      transportDetails.data.validationAddress as ValidationAddress
    );

    const sessionData = await this.commsClient.broadcast.create({
      addresses: addresses,
      maxAttempts: 1,
      message: {
        content: selectedCommunication.message,
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
        return group.stakeholders.map((stakeholder) => {
          if (validationAddress === ValidationAddress.EMAIL) {
            return stakeholder?.email || null;
          } else if (
            validationAddress === ValidationAddress.PHONE &&
            stakeholder.phone
          ) {
            return stakeholder.phone.substring(+stakeholder.phone.length - 10);
          } else if (validationAddress === ValidationAddress.ANY) {
            if (stakeholder.phone) {
              return stakeholder.phone
                ? stakeholder.phone.substring(+stakeholder.phone.length - 10)
                : null;
            }
          }
          return null
        }).filter(Boolean);
      case 'BENEFICIARY':
        const beneficiaryGroup = await this.beneficiaryService.getOneGroup(
          groupId as UUID
        );
        if(!beneficiaryGroup) throw new RpcException('Beneficiary group not found.');
        const groupedBeneficiaries = beneficiaryGroup.groupedBeneficiaries;
        return groupedBeneficiaries?.map((beneficiary) => {
          if (validationAddress === ValidationAddress.EMAIL) {
            return beneficiary.Beneficiary?.pii?.email || null;
          } else if (
            validationAddress === ValidationAddress.PHONE &&
            beneficiary.Beneficiary?.pii?.phone
          ) {
            return beneficiary.Beneficiary?.pii?.phone.substring(+beneficiary.Beneficiary?.pii?.phone?.length - 10);
          } else if (validationAddress === ValidationAddress.ANY) {
            if (beneficiary.Beneficiary?.pii?.phone) {
              return beneficiary.Beneficiary?.pii?.phone
                ? beneficiary.Beneficiary?.pii?.phone.substring(+beneficiary.Beneficiary?.pii?.phone.length - 10)
                : null;
            }
          }
          return null
        }).filter(Boolean);
      default:
        return []
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

    const docs = activityDocuments || [];

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
        let campaignId: number;
        switch (comms.groupType) {
          case 'STAKEHOLDERS':
            if (comms.campaignId) {
              const campaginDetails =
                await this.communicationService.communication.getCampaign(
                  Number(comms.campaignId)
                );
              const audienceIds = campaginDetails.data?.audiences?.map(
                (d) => d.id
              );

              await this.communicationService.communication.updateCampaign(
                comms.campaignId,
                {
                  audienceIds: audienceIds,
                  details: JSON.parse(
                    JSON.stringify({ message: comms.message })
                  ),
                  name: title || activity.title,
                }
              );

              updateActivityCommunicationPayload.push(comms);
              break;
            }
            campaignId = await this.processStakeholdersCommunication(
              comms,
              title || activity.title
            );

            updateActivityCommunicationPayload.push({
              ...comms,
              campaignId,
            });
            break;
          case 'BENEFICIARY':
            if (comms.campaignId) {
              const campaginDetails =
                await this.communicationService.communication.getCampaign(
                  Number(comms.campaignId)
                );
              const audienceIds = campaginDetails.data?.audiences?.map(
                (d) => d.id
              );

              await this.communicationService.communication.updateCampaign(
                comms.campaignId,
                {
                  audienceIds: audienceIds,
                  details: JSON.parse(
                    JSON.stringify({ message: comms.message })
                  ),
                  name: title || activity.title,
                }
              );

              updateActivityCommunicationPayload.push(comms);
              break;
            }
            campaignId = await this.processBeneficiaryCommunication(
              comms,
              title || activity.title
            );

            updateActivityCommunicationPayload.push({
              ...comms,
              campaignId,
            });
            break;
          default:
            break;
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

  async getCommunicationLogs() {
    const commsLogs =
      await this.communicationService.communication.getCommunicationLogs();
    return commsLogs.data;
  }
}

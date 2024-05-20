import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { CommunicationService } from '@rumsan/communication/services/communication.client';

import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import {
  ActivityCommunicationData,
  AddActivityData,
  GetActivitiesDto,
  GetOneActivity,
  RemoveActivityData,
  UpdateActivityData,
} from './dto';
import { StakeholdersService } from '../stakeholders/stakeholders.service';
import { ActivitiesStatus } from '@prisma/client';
import { RpcException } from '@nestjs/microservices';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);
  private communicationService: CommunicationService;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private readonly stakeholdersService: StakeholdersService
  ) {
    this.communicationService = new CommunicationService({
      baseURL: this.configService.get('COMMUNICATION_URL'),
      headers: {
        appId: this.configService.get('COMMUNICATION_APP_ID'),
      },
    });
  }

  async add(payload: AddActivityData) {
    const { activityCommunication, isAutomated, title, leadTime, categoryId, description, hazardTypeId, phaseId, responsibility, source, activityDocuments } = payload

    const createActivityCommunicationPayload = []
    const createActivityPayoutPayload = []
    const docs = activityDocuments || []

    if (activityCommunication?.length) {
      for (const comms of activityCommunication) {
        switch (comms.groupType) {
          case 'STAKEHOLDERS':
            const campaignId = await this.processStakeholdersCommunication(comms, title);
            createActivityCommunicationPayload.push({
              ...comms,
              campaignId
            })
            break;
          case 'BENEFICIARY':
            await this.processBeneficiaryCommunication(comms)
            break;
          default:
            break;
        }
      }
    }



    return await this.prisma.activities.create({
      data: {
        title,
        description,
        leadTime,
        responsibility,
        source,
        category: {
          connect: { uuid: categoryId }
        },
        hazardType: {
          connect: { uuid: hazardTypeId }
        },
        phase: {
          connect: { uuid: phaseId }
        },
        isAutomated: isAutomated,
        activityCommunication: createActivityCommunicationPayload,
        activityPayout: createActivityPayoutPayload,
        activityDocuments: JSON.parse(JSON.stringify(docs))
      },
    });
  }

  async processStakeholdersCommunication(payload: ActivityCommunicationData, title: string) {
    const transportId = await this.getTransportId(payload.communicationType)

    const { data: audience } = await this.communicationService.communication.listAudience()

    const stakeholderGroup = await this.stakeholdersService.findOneGroup({
      uuid: payload.groupId,
    });

    const stakeholderEmails = stakeholderGroup.stakeholders.map(stakeholder => stakeholder.email);
    const stakeholderPhones = stakeholderGroup.stakeholders.map(stakeholder => stakeholder.phone);

    const audienceEmails = audience.map(audience => audience.details.email);
    const audiencePhones = audience.map(audience => audience.details.phone);

    // get stakeholders not in audience
    const stakeholdersNotInAudience = stakeholderGroup.stakeholders.filter(stakeholder => {
      return !audienceEmails.includes(stakeholder.email) || !audiencePhones.includes(stakeholder.phone);
    });

    // get audience which already has stakeholders
    const stakeholdersInAudience = audience.filter(audience => {
      return stakeholderEmails.includes(audience.details.email) || stakeholderPhones.includes(audience.details.phone);
    });

    const audienceIds = [...stakeholdersInAudience.map((audience) => audience.id)]

    for (const stakeholder of stakeholdersNotInAudience) {
      const response = await this.communicationService.communication.createAudience({
        details: {
          name: stakeholder.name,
          phone: stakeholder.phone,
          // fix: add email to audience type in sdk
          // @ts-ignore: Unreachable code error
          email: stakeholder.email,
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
      details: { message: payload.message },
      startTime: new Date(),
    };

    //create campaign
    const campaign = await this.communicationService.communication.createCampaign(campaignPayload);
    return campaign.data.id;
  }

  async processBeneficiaryCommunication(payload: ActivityCommunicationData) {
    console.log(payload)
  }

  async getTransportId(transportName: string) {
    const transports = await this.communicationService.communication.listTransport();
    const t = transports.data.find((d) => d.name.toLowerCase() === transportName.toLowerCase())
    return t.id;
  }

  async getOne(payload: GetOneActivity) {
    const { uuid } = payload
    const { activityCommunication: aComm, ...activityData } = await this.prisma.activities.findUnique({
      where: {
        uuid: uuid
      },
      include: {
        category: true,
        hazardType: true,
        phase: true
      }
    })

    const activityCommunication = []
    const activityPayout = []

    if (Array.isArray(aComm) && aComm.length) {
      for (const comm of aComm) {
        const communication = JSON.parse(JSON.stringify(comm)) as ActivityCommunicationData & { campaignId: number }
        const { data: campaignData } = await this.communicationService.communication.getCampaign(communication.campaignId)

        let groupName: string;

        switch (communication.groupType) {
          case 'STAKEHOLDERS':
            const group = await this.prisma.stakeholdersGroups.findUnique({
              where: {
                uuid: communication.groupId
              }
            })
            groupName = group.name
            break;
          case 'BENEFICIARY':
            console.log('Benificary logic here.')
            break;
          default:
            break;
        }

        activityCommunication.push({
          ...communication,
          groupName: groupName,
          campaignData: campaignData
        })
      }
    }

    return {
      ...activityData,
      activityCommunication,
      activityPayout
    }
  }

  async getAll(payload: GetActivitiesDto) {
    const {
      page,
      perPage,
      title,
      category,
      hazardType,
      phase,
      isComplete,
      isApproved,
    } = payload;

    const query = {
      where: {
        isDeleted: false,
        ...(title && { title: { contains: title, mode: 'insensitive' } }),
        ...(category && { categoryId: category }),
        ...(hazardType && { hazardTypeId: hazardType }),
        ...(phase && { phaseId: phase }),
        ...(isComplete && { isComplete: isComplete }),
        ...(isApproved && { isApproved: isApproved }),
      },
      include: {
        category: true,
        hazardType: true,
        phase: true,
      },
    };

    return paginate(this.prisma.activities, query, {
      page,
      perPage,
    });
  }

  async remove(payload: RemoveActivityData) {
    return await this.prisma.activities.update({
      where: {
        uuid: payload.uuid,
      },
      data: {
        isDeleted: true,
      },
    });
  }

  async triggerCommunication(campaignId: string) {
    const cId = Number(campaignId)
    const triggerResponse = await this.communicationService.communication.triggerCampaign(cId)
    return triggerResponse.data;
  }

  async updateStatus(payload: { uuid: string, status: ActivitiesStatus }) {
    const { status, uuid } = payload
    return this.prisma.activities.update({
      where: {
        uuid: uuid
      },
      data: {
        status: status
      }
    })
  }

  async update(payload: UpdateActivityData) {
    console.log("update called");

    const { uuid, activityCommunication, isAutomated, title, source, responsibility, phaseId, leadTime, hazardTypeId, description, categoryId, activityDocuments } = payload
    const activity = await this.prisma.activities.findUnique({
      where: {
        uuid: uuid
      }
    })
    if (!activity) throw new RpcException('Activity not found.')

    const updateActivityCommunicationPayload = []
    const updateActivityDocuments = activityDocuments?.length ? JSON.parse(JSON.stringify(activityDocuments)) : []

    if (activityCommunication?.length) {
      for (const comms of activityCommunication) {
        switch (comms.groupType) {
          case 'STAKEHOLDERS':
            if (comms.campaignId) {
              updateActivityCommunicationPayload.push(comms)
              break;
            }
            const campaignId = await this.processStakeholdersCommunication(comms, title || activity.title);

            updateActivityCommunicationPayload.push({
              ...comms,
              campaignId
            })
            break;
          case 'BENEFICIARY':
            await this.processBeneficiaryCommunication(comms)
            break;
          default:
            break;
        }
      }
    }


    return await this.prisma.activities.update({
      where: {
        uuid: uuid
      },
      data: {
        title: title || activity.title,
        description: description || activity.description,
        source: source || activity.source,
        responsibility: responsibility || activity.responsibility,
        leadTime: leadTime || activity.leadTime,
        isAutomated: isAutomated || activity.isAutomated,
        phase: {
          connect: {
            uuid: phaseId || activity.phaseId
          }
        },
        category: {
          connect: {
            uuid: categoryId || activity.categoryId
          }
        },
        hazardType: {
          connect: {
            uuid: hazardTypeId || activity.hazardTypeId
          }
        },
        activityCommunication: updateActivityCommunicationPayload,
        activityDocuments: updateActivityDocuments || activity.activityDocuments,
        updatedAt: new Date()
      }
    })
  }
}

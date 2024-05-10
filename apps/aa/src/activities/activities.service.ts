import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
// import { CommunicationService } from '@rumsan/communication';
import { CommunicationService } from '@rumsan/communication/services/communication.client';

import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import {
  ActivityCommunicationData,
  AddActivityComms,
  AddActivityData,
  GetActivitiesDto,
  RemoveActivityData,
} from './dto';
import { StakeholdersService } from '../stakeholders/stakeholders.service';
import { Audience } from '@rumsan/communication/types';

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
    const { activityCommunication, title, leadTime, categoryId, description, hazardTypeId, phaseId, responsibility, source } = payload

    const createActivityCommunicationPayload = []
    const createActivityPayoutPayload = []

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
        activityCommunication: createActivityCommunicationPayload,
        activityPayout: createActivityPayoutPayload
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

  // async addCommunication(payload) {

  //   const communicationService = new CommunicationService({
  //     baseURL: process.env.COMMUNICATION_URL,
  //     headers: {
  //       appId: process.env.COMMUNICATION_APP_ID,
  //     },
  //   });

  //   const activity = await this.prisma.activities.findUnique({
  //     where: {
  //       uuid: payload.activityId
  //     }
  //   })

  //   const groups: any = await this.stakeholdersService.findGroup({
  //     uuid: payload?.group,
  //   });
  //   const audienceIds = [];

  //   const audiences = await communicationService.communication.listAudience();

  //   // emails and phones from stakeholders
  //   const stakeholderEmails = groups.stakeholders.map(stakeholder => stakeholder.email);
  //   const stakeholderPhones = groups.stakeholders.map(stakeholder => stakeholder.phone);

  //   const audienceEmails = audiences.data.map(audience => audience.details.email);
  //   const audiencePhones = audiences.data.map(audience => audience.details.phone);

  //   // get stakeholders not in audience
  //   const stakeholdersNotInAudience = groups.stakeholders.filter(stakeholder => {
  //     return !audienceEmails.includes(stakeholder.email) || !audiencePhones.includes(stakeholder.phone);
  //   });

  //   // get audience which already has stakeholders
  //   const stakeholdersInAudience = audiences.data.filter(audience => {
  //     return stakeholderEmails.includes(audience.details.email) || stakeholderPhones.includes(audience.details.phone);
  //   });

  //   for (const stakeholder of stakeholdersNotInAudience) {
  //     const response = await communicationService.communication.createAudience({
  //       details: {
  //         name: stakeholder.name,
  //         phone: stakeholder.phone,
  //         // @ts-ignore: Unreachable code error
  //         email: stakeholder.email,
  //       },
  //     });
  //     audienceIds.push(response.data.id);
  //   }

  //   for (const audience of stakeholdersInAudience) {
  //     audienceIds.push(audience.id)
  //   }

  //   const transport = await communicationService.communication.listTransport();
  //   let transportId;

  //   transport?.data.map((tdata) => {
  //     if (
  //       tdata.name.toLowerCase() === payload?.communicationType.toLowerCase()
  //     ) {
  //       transportId = tdata.id;
  //     }
  //   });
  //   const campaignPayload = {
  //     audienceIds: audienceIds,
  //     name: activity.title,
  //     status: 'ONGOING',
  //     transportId: transportId,
  //     type: payload?.communicationType.toUpperCase(),
  //     details: { message: payload?.message },
  //     startTime: new Date(),
  //   };

  //   //create campaign
  //   const campaign = await communicationService.communication.createCampaign(
  //     campaignPayload
  //   );

  //   const activityComms = await this.createActivityComms({
  //     campaignId: String(campaign.data.id),
  //     stakeholdersGropuId: payload?.group,
  //     activityId: payload.activityId,
  //   });

  //   // update status to wip
  //   await this.prisma.activities.update({
  //     where: {
  //       uuid: activity.uuid
  //     },
  //     data: {
  //       status: 'WORK_IN_PROGRESS'
  //     }
  //   })

  //   return activityComms;
  // }

  // //trigger communication
  // async triggerCommunication(payload) {
  //   const communicationService = new CommunicationService({
  //     baseURL: process.env.COMMUNICATION_URL,
  //     headers: {
  //       appId: process.env.COMMUNICATION_APP_ID,
  //     },
  //   });
  //   const response = await communicationService.communication.triggerCampaign(
  //     Number(payload)
  //   );

  //   return response
  // }



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
}

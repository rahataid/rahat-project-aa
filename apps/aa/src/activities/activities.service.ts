import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { } from '@rumsan/communication';
import { CommunicationService } from '@rumsan/communication/services/communication.client';

import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import {
  AddActivityComms,
  AddActivityData,
  GetActivitiesDto,
  RemoveActivityData,
} from './dto';
import { StakeholdersService } from '../stakeholders/stakeholders.service';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);
  constructor(
    private prisma: PrismaService,
    private readonly stakeholdersService: StakeholdersService
  ) { }

  async addCommunication(payload) {

    const communicationService = new CommunicationService({
      baseURL: process.env.COMMUNICATION_URL,
      headers: {
        appId: process.env.COMMUNICATION_APP_ID,
      },
    });

    const activity = await this.prisma.activities.findUnique({
      where: {
        uuid: payload.activityId
      }
    })

    const groups: any = await this.stakeholdersService.findGroup({
      uuid: payload?.group,
    });
    const audienceIds = [];

    const audiences = await communicationService.communication.listAudience();

    // emails and phones from stakeholders
    const stakeholderEmails = groups.stakeholders.map(stakeholder => stakeholder.email);
    const stakeholderPhones = groups.stakeholders.map(stakeholder => stakeholder.phone);

    const audienceEmails = audiences.data.map(audience => audience.details.email);
    const audiencePhones = audiences.data.map(audience => audience.details.phone);

    // get stakeholders not in audience
    const stakeholdersNotInAudience = groups.stakeholders.filter(stakeholder => {
      return !audienceEmails.includes(stakeholder.email) || !audiencePhones.includes(stakeholder.phone);
    });

    // get audience which already has stakeholders
    const stakeholdersInAudience = audiences.data.filter(audience => {
      return stakeholderEmails.includes(audience.details.email) || stakeholderPhones.includes(audience.details.phone);
    });

    for (const stakeholder of stakeholdersNotInAudience) {
      const response = await communicationService.communication.createAudience({
        details: {
          name: stakeholder.name,
          phone: stakeholder.phone,
          // @ts-ignore: Unreachable code error
          email: stakeholder.email,
        },
      });
      audienceIds.push(response.data.id);
    }

    for (const audience of stakeholdersInAudience) {
      audienceIds.push(audience.id)
    }

    const transport = await communicationService.communication.listTransport();
    let transportId;

    transport?.data.map((tdata) => {
      if (
        tdata.name.toLowerCase() === payload?.communicationType.toLowerCase()
      ) {
        transportId = tdata.id;
      }
    });
    const campaignPayload = {
      audienceIds: audienceIds,
      name: activity.title,
      status: 'ONGOING',
      transportId: transportId,
      type: payload?.communicationType.toUpperCase(),
      details: { message: payload?.message },
      startTime: new Date(),
    };

    //create campaign
    const campaign = await communicationService.communication.createCampaign(
      campaignPayload
    );

    const activityComms = await this.createActivityComms({
      campaignId: String(campaign.data.id),
      stakeholdersGropuId: payload?.group,
      activityId: payload.activityId,
    });

    // update status to wip
    await this.prisma.activities.update({
      where: {
        uuid: activity.uuid
      },
      data: {
        status: 'WORK_IN_PROGRESS'
      }
    })

    return activityComms;
  }

  //trigger communication
  async triggerCommunication(payload) {
    const communicationService = new CommunicationService({
      baseURL: process.env.COMMUNICATION_URL,
      headers: {
        appId: process.env.COMMUNICATION_APP_ID,
      },
    });
    const response = await communicationService.communication.triggerCampaign(
      Number(payload)
    );

    return response
  }

  async add(payload: AddActivityData) {
    return await this.prisma.activities.create({
      data: payload,
    });
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
        activityComm: {
          include: {
            stakeholdersGroup: true
          }
        },
      },
    };

    // this.prisma.activities.findMany({
    //   include: {
    //     activityComm: {
    //       include: {
    //         stakeholdersGroup: true
    //       }
    //     }
    //   }
    // })

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
  async createActivityComms(payload: AddActivityComms) {
    return await this.prisma.activityComms.create({
      data: payload,
    });
  }
}

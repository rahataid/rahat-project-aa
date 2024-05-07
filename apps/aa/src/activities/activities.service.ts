import { Injectable, Logger } from '@nestjs/common';
import { CommunicationService } from '@rumsan/communication/services/communication.client';

import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import {
  AddActivityComms,
  AddActivityData,
  AddCommunication,
  GetActivitiesDto,
  RemoveActivityData,
} from './dto';
import { StakeholdersService } from '../stakeholders/stakeholders.service';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);
  private readonly communicationService: CommunicationService;

  constructor(
    private prisma: PrismaService,
    private readonly stakeholdersService: StakeholdersService
  ) {
    this.communicationService = new CommunicationService({
      baseURL: process.env.COMMUNICATION_URL,
      headers: {
        appId: process.env.COMMUNICATION_APP_ID,
      },
    });
  }

  async addCommunication(payload: AddCommunication) {
    try {
      const groups: any = await this.stakeholdersService.findGroup({
        uuid: payload?.group,
      });
      const audienceIds = await this.getOrCreateAudienceIds(
        groups?.stakeholders
      );

      const transport =
        await this.communicationService.communication.listTransport();
      let transportId = await this.getTransportId(payload?.communicationType);

      const campaignPayload = {
        audienceIds: audienceIds,
        name: 'AA',
        status: 'ONGOING',
        transportId: transportId,
        type: payload?.communicationType.toUpperCase(),
        details: { message: payload?.message },
        startTime: new Date(),
      };

      //create campaign
      const campaign =
        await this.communicationService.communication.createCampaign(
          campaignPayload
        );

      if (campaign) {
        const activityComms = await this.createActivityComms({
          campaignId: String(campaign.data.id),
          stakeholdersGropuId: payload?.group,
          activityId: payload.activityId,
        });
        return activityComms;
      }
    } catch (e) {
      throw Error(`Something went wrong: ${e}`);
    }
  }

  private async getOrCreateAudienceIds(stakeholders) {
    const audienceIds = [];

    for (const stakeholder of stakeholders) {
      const audiences =
        await this.communicationService.communication.listAudience();

      const existingAudience = audiences.data.find((audience) =>
        this.isSameStakeholder(audience.details, stakeholder)
      );

      if (existingAudience) {
        audienceIds.push(existingAudience.id);
      } else {
        const response =
          await this.communicationService.communication.createAudience({
            details: {
              name: stakeholder.name,
              phone: stakeholder.phone,
              // @ts-ignore: Unreachable code error
              email: stakeholder.email,
            },
          });
        audienceIds.push(response.data.id);
      }
    }

    return audienceIds;
  }

  private isSameStakeholder(audienceDetails, stakeholder) {
    return (
      audienceDetails?.email === stakeholder.email ||
      audienceDetails?.phone === stakeholder.phone
    );
  }

  private async getTransportId(communicationType) {
    const transport =
      await this.communicationService.communication.listTransport();

    const transportId = transport.data.find(
      (tdata) => tdata.name.toLowerCase() === communicationType.toLowerCase()
    )?.id;

    return transportId;
  }

  //trigger communication
  async triggerCommunication(payload) {
    const response =
      await this.communicationService.communication.triggerCampaign(
        Number(payload)
      );

    if (response) return 'Success';
    else {
      throw new Error('Campaign Already Completed');
    }
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
        activityComm: true,
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
  async createActivityComms(payload: AddActivityComms) {
    return await this.prisma.activityComms.create({
      data: payload,
    });
  }
}

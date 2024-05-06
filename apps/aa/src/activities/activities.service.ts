import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import {} from '@rumsan/communication';
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
  ) {}

  async addCommunication(payload) {
    try {
      const communicationService = new CommunicationService({
        baseURL: process.env.COMMUNICATION_URL,
        headers: {
          appId: process.env.COMMUNICATION_APP_ID,
        },
      });
      const groups: any = await this.stakeholdersService.findGroup({
        uuid: payload?.group,
      });
      const audienceIds = [];
      for (const stakeholder of groups?.stakeholders) {
        const response =
          await communicationService.communication.createAudience({
            details: {
              name: stakeholder.name,
              phone: stakeholder.phone,
              // @ts-ignore: Unreachable code error
              email: stakeholder.email,
            },
          });
        audienceIds.push(response.data.id);
      }
      const transport =
        await communicationService.communication.listTransport();
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
        name: 'AA',
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

  async add(payload: AddActivityData) {
    //create campaign
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

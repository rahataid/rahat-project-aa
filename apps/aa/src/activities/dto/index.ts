// import { ActivityTypes } from '@prisma/client';

export interface ActivityCommunicationData {
  groupType: 'STAKEHOLDERS' | 'BENEFICIARY';
  groupId: string;
  communicationType: string;
  message: string;
}

export interface AddActivityData {
  title: string;
  leadTime: string;
  phaseId: string;
  categoryId: string;
  hazardTypeId: string;
  responsibility: string;
  source: string;
  description: string;
  activityCommunication: Array<ActivityCommunicationData>
  activityPayout: Array<Record<string, any>>;
}

export interface AddActivityComms {
  campaignId: string;
  stakeholdersGropuId: string;
  activityId: string;
}

interface ActivityUUID {
  uuid: string
}
export type RemoveActivityData = ActivityUUID

export type GetOneActivity = ActivityUUID

export interface GetActivitiesDto {
  title: string;
  isComplete: boolean;
  isApproved: boolean;
  phase: string;
  category: string;
  hazardType: string;
  page: number;
  perPage: number;
}

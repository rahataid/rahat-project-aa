import { ActivityTypes } from "@prisma/client";

export interface AddActivityData {
    title: string;
    phaseId: string;
    categoryId: string;
    hazardTypeId: string;
    responsibility: string;
    source: string;
    description: string;
    activityType: ActivityTypes;
}

export interface RemoveActivityData {
    uuid: string
}

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
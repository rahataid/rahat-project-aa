export interface AddActivityData {
    title: string;
    phaseId: string;
    categoryId: string;
    hazardTypeId: string;
    responsibility: string;
    source: string;
    description: string;
}

export interface RemoveActivityData {
    uuid: string
}

export interface GetActivitiesDto {
    title: string;
    phase: string;
    category: string;
    hazardType: string;
    page: number;
    perPage: number;
}
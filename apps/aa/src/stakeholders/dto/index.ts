export interface AddStakeholdersData {
  name: string;
  email: string;
  phone: string;
  designation: string;
  organization: string;
  district: string;
  municipality: string;
}

export interface UpdateStakeholdersData {
  uuid: string;
  name?: string;
  email?: string;
  phone?: string;
  designation?: string;
  organization?: string;
  district?: string;
  municipality?: string;
}

export interface RemoveStakeholdersData {
  uuid: string;
}

export interface GetStakeholdersData {
  name: string;
  designation: string;
  organization: string;
  district: string;
  municipality: string;
  page: number;
  order?: string;
  sort?: string;
  perPage: number;
}

export interface AddStakeholdersGroups {
  name: string;
  stakeholders: Array<{
    uuid: string;
  }>;
}

export interface UpdateStakeholdersGroups {
  uuid: string;
  name?: string;
  stakeholders?: Array<{
    uuid: string;
  }>;
}

export interface GetAllGroups {
  page: number;
  perPage: number;
  order?: string;
  sort?: string;
  search?: string;
}

export interface GetOneGroup {
  uuid: string;
}

export interface RemoveStakeholdersGroup {
  uuid: string;
}

export interface FindStakeholdersGroup {
  uuid: string;
}

import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateStakeholderDto {
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @IsOptional()
  email?: string;

  @IsString()
  @Length(7, 20, {
    message: 'Phone number must be between 7 and 20 characters',
  })
  phone: string;

  @IsString()
  designation: string;

  @IsString()
  organization: string;

  @IsString()
  district: string;

  @IsString()
  municipality: string;
}

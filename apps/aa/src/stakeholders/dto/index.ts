export interface AddStakeholdersData {
  name: string;
  email: string;
  phone: string;
  designation: string;
  organization: string;
  district: string;
  municipality: string;
  supportArea: string[];
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
  supportArea?: string[];
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
  supportArea: string;
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

export class getGroupByUuidDto {
  uuids: string[];
  selectField: string[];
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

export interface BulkAddStakeholdersPayload {
  data: any[];
  isGroupCreate: boolean;
  groupName?: string;
}

import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { IsValidPhone } from '../../validators/phone.validator';

export class CreateStakeholderDto {
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  email?: string;

  @IsString()
  @Length(7, 20, {
    message: 'Phone number must be between 7 and 20 characters',
  })
  @IsValidPhone({
    message:
      'Phone number is not valid. Please provide a valid international phone number.',
  })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'Designation is required' })
  designation: string;

  @IsString()
  @IsNotEmpty({ message: 'Organization is required' })
  organization: string;

  @IsString()
  @IsNotEmpty({ message: 'District is required' })
  district: string;

  @IsString()
  @IsNotEmpty({ message: 'Municipality is required' })
  municipality: string;

  @IsOptional()
  @IsArray({ message: 'supportArea must be an array of strings' })
  @IsString({ each: true, message: 'Each supportArea must be a string' })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v); // filter out empty
    }
    if (Array.isArray(value)) {
      return value.map((v) => (typeof v === 'string' ? v.trim() : v));
    }
    return value;
  })
  supportArea?: string[];
}

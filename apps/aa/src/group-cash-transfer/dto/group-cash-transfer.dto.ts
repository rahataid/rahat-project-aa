import { IsString, IsOptional, IsNumber, IsObject, IsUUID, IsBoolean, IsArray } from 'class-validator';
import { UserObject } from '../../inkinds';

export class CreateGroupCashTransferDto {
  @IsString({ message: '[GCT_NAME_MUST_BE_STRING] name must be a string' })
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsObject()
  bankDetails?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  extras?: Record<string, unknown>;
}

export class UpdateGroupCashTransferDto {
  @IsUUID(undefined, { message: '[GCT_UUID_MUST_BE_VALID] uuid must be a valid UUID' })
  uuid!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsObject()
  bankDetails?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  extras?: Record<string, unknown>;
}

export class ListGroupCashTransferDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  perPage?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  ward?: string;

  @IsOptional()
  @IsArray()
  supportArea?: string[];

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsString()
  order?: 'asc' | 'desc';

  @IsOptional()
  @IsBoolean()
  hasFund?: boolean;
}

export class AssignFundDto {
  @IsUUID(undefined, { message: '[GCT_GROUP_ID_MUST_BE_VALID] groupCashTransferId must be a valid UUID' })
  groupCashTransferId!: string;

  @IsString({ message: '[GCT_FUND_TITLE_MUST_BE_STRING] title must be a string' })
  title!: string;

  @IsNumber({}, { message: '[GCT_AMOUNT_MUST_BE_NUMBER] amount must be a number' })
  amount!: number;

    @IsObject()
  user: UserObject;
}

export class UpdateGroupCashTransferRecordDto {
  @IsUUID(undefined, { message: '[GCT_UUID_MUST_BE_VALID] uuid must be a valid UUID' })
  uuid!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;
}

export class ListGroupCashTransferRecordDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  perPage?: number;

  @IsOptional()
  @IsString()
  groupCashTransferName?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsString()
  order?: 'asc' | 'desc';
}

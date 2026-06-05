import { IsString, IsOptional, IsNumber, IsObject, IsUUID, IsBoolean, IsArray } from 'class-validator';
import { UserObject } from '../../inkinds';

export class CreateGroupCashTransferDto {
  @IsString()
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
  @IsUUID()
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
  @IsUUID()
  groupCashTransferId!: string;

  @IsString()
  title!: string;

  @IsNumber()
  amount!: number;

    @IsObject()
  user: UserObject;
}

export class ListGroupCashTransferRecordDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  perPage?: number;

  @IsUUID()
  groupCashTransferId!: string;

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

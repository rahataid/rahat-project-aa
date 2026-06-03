import { IsString, IsOptional, IsNumber, IsObject, IsUUID } from 'class-validator';

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
  sort?: string;

  @IsOptional()
  @IsString()
  order?: 'asc' | 'desc';
}

export class AssignFundDto {
  @IsUUID()
  groupCashTransferId!: string;

  @IsNumber()
  amount!: number;
}

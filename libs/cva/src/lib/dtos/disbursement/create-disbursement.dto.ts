import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

enum DisbursementStatus {
  SYNCING_OFFLINE = 'SYNCING_OFFLINE',
  SYNCED_OFFLINE = 'SYNCED_OFFLINE',
  ONLINE = 'ONLINE',
}

export class CreateDisbursementDto {
  @IsString()
  uuid!: string;

  @IsNumber()
  @IsNotEmpty()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  walletAddress!: string;

  @IsString()
  @IsOptional()
  planUid?: string;

  @IsString()
  @IsOptional()
  @IsEnum(DisbursementStatus)
  status?: DisbursementStatus;
}

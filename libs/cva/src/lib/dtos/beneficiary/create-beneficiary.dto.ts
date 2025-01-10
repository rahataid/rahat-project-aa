import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class BaseBeneficiaryDto {
  constructor(data: BaseBeneficiaryDto) {
    this.uuid = data.uuid;
    this.walletAddress = data.walletAddress;
    this.extras = data['extras'];
  }

  @IsString()
  @IsNotEmpty()
  uuid: string;

  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @IsObject()
  extras?: Record<string, unknown>;

  [key: string]: any;
}

export class CreateBeneficiaryDto extends BaseBeneficiaryDto {
  constructor(data: CreateBeneficiaryDto) {
    super(data);
  }
}

export class GetBeneficiaryDto {
  @IsString()
  @IsNotEmpty()
  uuid!: string;

  @IsObject()
  data?: Record<string, any>;
}

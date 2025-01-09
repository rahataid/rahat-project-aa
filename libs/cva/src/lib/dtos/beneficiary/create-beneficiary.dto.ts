import { IsNotEmpty, IsObject, IsString } from 'class-validator';

// TODOS:
// Extendable DTOs: DONE
// Import lib service into project
// Support schema changes Create dynamically: DONE
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

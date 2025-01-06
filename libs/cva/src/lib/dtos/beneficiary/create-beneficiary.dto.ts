import { IsNotEmpty, IsString } from 'class-validator';

export class BaseDTO<T = {}> {
  constructor() {
    this.walletAddress = '';
    this.uuid = '';
  }

  @IsString()
  @IsNotEmpty()
  uuid: string;

  @IsString()
  @IsNotEmpty()
  walletAddress!: string;

  [key: string]: any;
}

export class GetBeneficiaryDto {
  @IsString()
  @IsNotEmpty()
  uuid!: string;
}

export class CreateBeneficiaryDto extends BaseDTO {}

import { IsNotEmpty, IsString } from 'class-validator';
import { PaginationBaseDto } from '../common';

export class CreateBeneficiaryGroupDto {
  constructor(data: CreateBeneficiaryGroupDto) {
    this.beneficiaryUID = data.beneficiaryUID;
    this.groupUID = data.groupUID;
  }

  @IsString()
  @IsNotEmpty()
  beneficiaryUID: string;

  @IsString()
  @IsNotEmpty()
  groupUID: string;
}

export class ListBeneficiaryByGroupDto extends PaginationBaseDto {
  constructor(data: ListBeneficiaryByGroupDto) {
    super();
    this.groupUID = data.groupUID;
  }

  @IsString()
  @IsNotEmpty()
  groupUID: string;
}

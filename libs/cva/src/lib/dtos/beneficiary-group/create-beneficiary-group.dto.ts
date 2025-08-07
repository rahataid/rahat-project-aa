import { IsArray, IsNotEmpty, IsString } from 'class-validator';
import { PaginationBaseDto } from '../common';

export class AddBeneficiariesToGroupDto {
  constructor(data: AddBeneficiariesToGroupDto) {
    this.beneficiaries = data.beneficiaries;
    this.groupUID = data.groupUID;
  }

  @IsArray()
  @IsNotEmpty()
  beneficiaries: string[];

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

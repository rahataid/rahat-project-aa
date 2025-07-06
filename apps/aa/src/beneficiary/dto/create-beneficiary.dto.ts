import { GroupPurpose } from '@prisma/client';
import { BaseBeneficiaryDto } from '@rahat-project/cva';
import { Enums } from '@rahataid/sdk';
import { IsEnum, IsNumber, IsOptional } from 'class-validator';

interface optionalBeneficiaryFields {
  benTokens?: number;
  gender?: Enums.Gender;
  isVerified?: boolean;
}

export class CreateBeneficiaryDto extends BaseBeneficiaryDto {
  constructor(data: CreateBeneficiaryDto & optionalBeneficiaryFields) {
    super(data);
    this.gender = data.gender;
    this.benTokens = data.benTokens;
  }

  @IsOptional()
  @IsNumber()
  benTokens?: number;

  @IsOptional()
  @IsEnum(Enums.Gender)
  gender?: Enums.Gender;
}

export interface AddBeneficiaryGroups {
  name: string;
  beneficiaries: Array<{
    uuid: string;
  }>;
}

export interface AddTokenToGroup {
  beneficiaryGroupId: string;
  numberOfTokens: number;
  totalTokensReserved: number;
  title: string;
  user?: any;
}

export interface AssignBenfGroupToProject {
  beneficiaryGroupData: {
    id: number;
    uuid: string;
    name: string;
    groupPurpose: GroupPurpose;
    groupedBeneficiaries?: Array<{
      id: number;
      uuid: string;
      beneficiaryGroupId: string;
      beneficiaryId: string;
      createdAt: Date;
      updatedAt: Date;
      deletedAt: Date | null;
    }>;
  };
}

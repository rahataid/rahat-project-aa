import { CreateStakeholderDto } from '.';

export type StakeholderValidationError = {
  rowNumber: number;
  rowData: CreateStakeholderDto;
  errors: string[];
};

export type ValidateStakeholdersResponse = {
  validStakeholders: CreateStakeholderDto[];
};

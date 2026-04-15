import { CreateStakeholderDto } from '.';

export type StakeholderValidationError = {
  phone?: string;
  email?: string;
  field: string;
  message: string;
};

export type ValidateStakeholdersResponse = {
  errors: StakeholderValidationError[];
};

export type CleanedStakeholder = Omit<
  CreateStakeholderDto,
  'phone' | 'email'
> & {
  phone: string | null;
  email: string | null;
};

export type ValidateBulkStakeholdersResponse = {
  newStakeholders: string[];
  updateStakeholders: string[];
  cleanedPayloads: CleanedStakeholder[];
  isValid: boolean;
  errors: StakeholderValidationError[];
};

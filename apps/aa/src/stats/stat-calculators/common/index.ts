import { StatCalculator } from '../types';
import { ageGroupsCalculator } from './age-groups.calculator';
import { channelUsageCalculator } from './channel-usage.calculator';
import { countByBankCalculator } from './count-by-bank.calculator';
import { fieldMapResultCalculator } from './field-map-result.calculator';
import { genderCalculator } from './gender.calculator';
import { haveActiveBankAcCalculator } from './have-active-bank-ac.calculator';
import { internetAccessCalculator } from './internet-access.calculator';

import { mobilePhoneAccessCalculator } from './mobile-phone-access.calculator';
import { receiveDisasterInfoCalculator } from './receive-disaster-info.calculator';
import { ssaRecipientCalculator } from './ssa-recipient.calculator';
import { stakeholdersTotalCalculator } from './stakeholders-total.calculator';
import { totalFamilyMembersCalculator } from './total-family-members.calculator';
import { totalRespondentsCalculator } from './total-respondents.calculator';
import { typeOfPhoneCalculator } from './type-of-phone.calculator';
import { typeOfSsaCalculator } from './type-of-ssa.calculator';
import { uniqueWardsCalculator } from './unique-wards.calculator';
import { useDigitalWalletsCalculator } from './use-digital-wallets.calculator';
import { wardLocationCalculator } from './ward-location.calculator';

export * from './age-groups.calculator';
export * from './channel-usage.calculator';
export * from './count-by-bank.calculator';
export * from './field-map-result.calculator';
export * from './gender.calculator';
export * from './have-active-bank-ac.calculator';
export * from './internet-access.calculator';
export * from './mobile-phone-access.calculator';
export * from './receive-disaster-info.calculator';
export * from './ssa-recipient.calculator';
export * from './stakeholders-total.calculator';
export * from './total-family-members.calculator';
export * from './total-respondents.calculator';
export * from './type-of-phone.calculator';
export * from './type-of-ssa.calculator';
export * from './unique-wards.calculator';
export * from './use-digital-wallets.calculator';
export * from './ward-location.calculator';

// Stats calculated the same way for every project/stat type. A stat type's
// index.ts (e.g. flood/index.ts) spreads this array and appends its own
// type-specific calculators.
export const COMMON_CALCULATORS: StatCalculator[] = [
  totalRespondentsCalculator,
  totalFamilyMembersCalculator,
  stakeholdersTotalCalculator,
  genderCalculator,
  ageGroupsCalculator,
  countByBankCalculator,
  haveActiveBankAcCalculator,
  useDigitalWalletsCalculator,
  internetAccessCalculator,
  // mobilePhoneAccessCalculator,
  // typeOfPhoneCalculator,
  // channelUsageCalculator,
  // receiveDisasterInfoCalculator,
  // ssaRecipientCalculator,
  // typeOfSsaCalculator,
  // fieldMapResultCalculator,
  // uniqueWardsCalculator,
  // wardLocationCalculator,
];

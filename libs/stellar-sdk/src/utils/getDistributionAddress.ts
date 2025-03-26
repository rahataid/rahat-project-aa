import { ait } from '../lib/axios/axiosInstanceTenant';
import { logger } from './logger';
import { LOGS } from '../constants/logger';
import { STELLAR } from '../constants/routes';

interface Tenant {
  name: string;
  distribution_account_address: string;
}

export const getDistributionAddress = async (name: string): Promise<string> => {
  logger.info(LOGS.INFO.DISBURSEMENT_ADDRESS(name));
  const res = await ait.get(STELLAR.TENANATS);

  const tenants: Tenant[] = res.data;
  const tenant = tenants.find((t) => t.name === name);

  if (!tenant) {
    logger.warn(LOGS.ERROR.DISBURSEMENT_ADDDRESS_NOT_FOUND(name));
    return LOGS.ERROR.DISBURSEMENT_ADDDRESS_NOT_FOUND(name);
  }

  return tenant.distribution_account_address;
};
